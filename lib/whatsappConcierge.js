// lib/whatsappConcierge.js
// The WhatsApp AI concierge — for a client the clinic already recognizes
// (their WhatsApp number is matched to a client record), drafts and sends
// its own reply automatically, for a deliberately narrow slice of what
// comes in: clinic FAQs (hours, address, phone, what to book) and
// checking/booking a ROUTINE CONSULT, VIDEO CONSULT, SPAY, CASTRATION, or
// DENTAL (cleaning or extractions) for one of that client's existing pets.
// Called once per inbound WhatsApp text message — see maybeRunConcierge,
// the only export the webhook calls.
//
// Everything else is left completely alone — no reply is sent, the
// message just sits in the inbox exactly as if this feature didn't
// exist, for a human to answer normally:
//   - an unmatched number (no client_id to work from)
//   - anything but a plain text message (a photo of an injury needs a
//     human's eyes, not this)
//
// Two cases never get a real AI-drafted reply, but DO still get a short,
// specific acknowledgment sent — never total silence — plus the thread
// flagged for staff (see flagEscalatedThread):
//   - a staff member is already actively replying in this thread (see the
//     handoff check below) — the AI never talks over a human with an
//     actual answer, but a client whose later message lands in that same
//     thread still deserves more than nothing (see sendStaffHandoffNotice)
//   - the model itself decides to escalate — see the system prompt's hard
//     rules below, and the escalate_to_staff tool it's given to do it
//     with, which never drafts a client-facing answer itself
//
// Safety comes from TWO independent layers, not just the model's own
// judgment: the tools below are the only actions it can take at all — it
// has no way to touch an invoice, a medical record, a refund, an existing
// appointment, or anything beyond a brand-new consult/spay/castration/
// dental — and the system prompt's hard rules tell it to hand off
// immediately for anything medical, anything about money already paid, or
// anything it's not fully confident about. Even inside book_consult/
// book_procedure, the exact slot it books is re-validated server-side
// against a fresh computeAvailableSlots call (lib/appointmentBooking.js)
// rather than trusted from what the model says it saw earlier in the
// conversation.
//
// Gated off entirely unless WHATSAPP_AI_ENABLED=true is set — the
// simplest possible kill switch if this ever needs to be turned off in a
// hurry, no redeploy required.

import { anthropic } from './anthropicClient';
import { supabase } from './supabaseClient';
import { supabaseAdmin } from './supabaseAdmin';
import { sendWhatsAppText, PROCEDURE_DROP_OFF_WINDOW, PROCEDURE_FASTING_TEXT } from './metaWhatsapp';
import { withoutDashes } from './noDashes';
import { findAppointmentConflict, checkStaffRoster, CONSULT_DURATION_MINUTES } from './appointmentScheduling';
import { computeAvailableSlots, CLIENT_APPOINTMENT_TYPE_LABELS, appointmentTypeAllowedForSex } from './appointmentBooking';

// The standard-duration procedure types the concierge may book directly,
// same as a routine consult — everything else in CLIENT_APPOINTMENT_TYPES
// stays staff-only: 'other_surgery' has no fixed duration (staff set one on
// approval, nothing to auto-book), and 'video' isn't offered here yet.
const PROCEDURE_TYPES = ['spay', 'castration', 'dental_small', 'dental_big'];

const MODEL = 'claude-opus-5';
const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 4;

export function isWhatsAppAiEnabled() {
  return process.env.WHATSAPP_AI_ENABLED === 'true';
}

const TOOLS = [
  {
    name: 'check_consult_availability',
    description:
      "Look up open slots for a ROUTINE CONSULT or VIDEO CONSULT on one date (same hours, same doctors — pass appointment_type: 'video' for a video consult, defaults to a regular in-person consult). Without vet_name, returns `times`: a short list of distinct available times, each with which vet(s) are free then. With vet_name, returns `times_for_requested_vet` (only that vet's times — check `requested_vet_has_availability`, it can be an empty list) PLUS `times_any_vet` (every open time that day regardless of vet) — if the requested vet has nothing, offer times from times_any_vet instead rather than saying nothing is available at all. This is the ONLY source of truth for availability; you must call this (again, even if you called it earlier in the conversation) before saying anything about whether a date/time works, and your answer must exactly match what it returns. Never use this for surgery, dental, or spay/castration — those need check_procedure_availability instead.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: "The date to check, as YYYY-MM-DD, in the clinic's own local time." },
        appointment_type: { type: 'string', enum: ['consult', 'video'], description: "'consult' (in-person, default) or 'video' (remote video call)." },
        vet_name: { type: 'string', description: "Optional — only pass this if the client is asking about one specific vet by name right now. Omit it for a general booking request, even if a specific vet was mentioned earlier in the conversation." },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_consult',
    description:
      "Book a routine consult or video consult for one of this client's existing pets, at an exact slot check_consult_availability just returned. Copy date/start_time/vet_id/appointment_type straight from that result — never guess or invent a time.",
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string', description: "The exact name of the pet, as it appears in this client's pet list above." },
        appointment_type: { type: 'string', enum: ['consult', 'video'], description: "'consult' (in-person, default) or 'video' (remote video call) — must match what was passed to check_consult_availability." },
        date: { type: 'string', description: 'YYYY-MM-DD — the same date passed to check_consult_availability.' },
        start_time: { type: 'string', description: 'The exact start_time string of the chosen slot, copied from check_consult_availability.' },
        vet_id: { type: 'string', description: 'The vet_id of the chosen slot, copied from check_consult_availability.' },
        reason: { type: 'string', description: "Short reason for the visit, in the client's own words." },
      },
      required: ['patient_name', 'date', 'start_time', 'vet_id'],
    },
  },
  {
    name: 'check_procedure_availability',
    description:
      "Look up open slots for a SPAY, CASTRATION, DENTAL CLEANING, or DENTAL/EXTRACTIONS on one date, for one of this client's existing pets. These run in their own morning surgery window, which starts later and ends earlier than a plain consult's hours — never assume regular consult times apply, and never reuse a result from check_consult_availability for this. This is the ONLY source of truth for these types; you must call this (again, even if you called it earlier in the conversation) before saying anything about whether a date/time works for one of these, and your answer must exactly match what it returns.",
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string', description: "The exact name of the pet, as it appears in this client's pet list above." },
        appointment_type: { type: 'string', enum: PROCEDURE_TYPES, description: 'spay, castration, dental_small (a routine cleaning), or dental_big (extractions expected).' },
        date: { type: 'string', description: "The date to check, as YYYY-MM-DD, in the clinic's own local time." },
      },
      required: ['patient_name', 'appointment_type', 'date'],
    },
  },
  {
    name: 'book_procedure',
    description:
      'Book a spay, castration, dental cleaning, or dental/extractions for one of this client\'s existing pets, at an exact slot check_procedure_availability just returned. Copy date/start_time/vet_id/appointment_type straight from that result — never guess or invent a time.',
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string', description: "The exact name of the pet, as it appears in this client's pet list above." },
        appointment_type: { type: 'string', enum: PROCEDURE_TYPES },
        date: { type: 'string', description: 'YYYY-MM-DD — the same date passed to check_procedure_availability.' },
        start_time: { type: 'string', description: 'The exact start_time string of the chosen slot, copied from check_procedure_availability.' },
        vet_id: { type: 'string', description: 'The vet_id of the chosen slot, copied from check_procedure_availability.' },
        reason: { type: 'string', description: "Short reason/notes, in the client's own words." },
      },
      required: ['patient_name', 'appointment_type', 'date', 'start_time', 'vet_id'],
    },
  },
  {
    name: 'list_upcoming_appointments',
    description:
      "List this client's upcoming booked appointments (pet, type, date, local time, vet), each with `movable` and, if not, `why_not`. Use it whenever the client asks when an appointment is, or wants to move one, to find the one they mean. For a surgery or procedure the time is the internal theatre slot: never quote it, give the drop-off window instead.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'move_appointment',
    description:
      "Move one of this client's existing ROUTINE CONSULT or VIDEO CONSULT appointments (one list_upcoming_appointments marked movable) to a new slot that check_consult_availability just returned. Copy appointment_id from list_upcoming_appointments and date/start_time/vet_id straight from check_consult_availability; never guess. This moves the existing booking, it never creates a second one.",
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string', description: 'The id of the appointment to move, from list_upcoming_appointments.' },
        date: { type: 'string', description: 'YYYY-MM-DD, the new date, the same one passed to check_consult_availability.' },
        start_time: { type: 'string', description: 'The exact start_time of the chosen new slot, copied from check_consult_availability.' },
        vet_id: { type: 'string', description: 'The vet_id of the chosen new slot, copied from check_consult_availability.' },
      },
      required: ['appointment_id', 'date', 'start_time', 'vet_id'],
    },
  },
  {
    name: 'cancel_appointment',
    description:
      "Cancel one of this client's upcoming appointments (any type), using its appointment_id from list_upcoming_appointments. Only call this after the client has clearly confirmed, in reply to you naming the pet, day and time, that they want that exact appointment cancelled.",
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string', description: 'The id of the appointment to cancel, from list_upcoming_appointments.' },
      },
      required: ['appointment_id'],
    },
  },
  {
    name: 'escalate_to_staff',
    description:
      'Hand this conversation to a human member of staff instead of replying yourself. No message is sent to the client — they just see it in the normal inbox like any other message. Always use this for anything medical or symptom-related, anything about money already paid, any non-standard/custom surgery request, moving an appointment that move_appointment cannot move (a surgery or procedure, one within 24 hours, one already checked in), or anything at all you are not fully confident about.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short internal note for staff on why this needed a human — not shown to the client.' },
      },
      required: ['reason'],
    },
  },
];

// UAE is UTC+4, no DST — shifting the raw UTC clock by that offset and
// then reading its UTC-labeled fields back off is a reliable way to get
// "today" in the clinic's own local time regardless of the server
// process's own timezone (same trick as uaeIso in appointmentBooking.js).
function uaeNow() {
  return new Date(Date.now() + 4 * 60 * 60 * 1000);
}

function uaeTodayContext() {
  const now = uaeNow();
  const dateStr = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `${weekday}, ${dateStr}`;
}

function buildSystemPrompt({ clientName, patients, clinicSettings }) {
  const petList = patients.length
    ? patients.map((p) => `- ${p.name} (${p.species}${p.sex && p.sex !== 'unknown' ? `, ${p.sex}` : ''})`).join('\n')
    : '(none on file yet)';

  return `You are the WhatsApp concierge for ${clinicSettings?.legal_name || 'the clinic'}, a veterinary clinic in the UAE, messaging ${clientName || 'a client'} on their own WhatsApp number.

Today is ${uaeTodayContext()}, in the clinic's own local time (UAE, UTC+4). Always resolve "today", "tomorrow", "this/next [weekday]", or a bare day+month with no year (e.g. "23 September") against THIS date — never guess, assume, or default to a different year. Live testing found this go wrong exactly once: it's the single most important fact in this prompt.

This client's pets on file:
${petList}

Clinic info you may share:
- Address: ${clinicSettings?.address || 'not on file — say you\'ll have someone confirm'}
- Phone: ${clinicSettings?.phone || 'not on file — say you\'ll have someone confirm'}

What you may do, and NOTHING else:
1. Answer simple factual questions about the clinic using only the info above.
2. Check availability for, and book, a ROUTINE CONSULT or VIDEO CONSULT (always exactly 15 minutes, same hours and doctors either way) for one of the pets listed above, using check_consult_availability/book_consult with appointment_type set to 'consult' (default) or 'video'. If the client doesn't say which, ask — don't assume either way.
3. Check availability for, and book, a SPAY, CASTRATION, DENTAL CLEANING, or DENTAL/EXTRACTIONS for one of the pets listed above, using check_procedure_availability/book_procedure. These run in their own, separate morning surgery window — narrower than a plain consult's hours, and never assumable; always check first.

After book_procedure succeeds, confirm the DATE only — never quote the slot's start_time to the client, since it's an internal theatre schedule, not an arrival time. In the same confirmation, pass on both client_instructions from its result clearly: the drop-off window (no set appointment time) and that the pet must be fasting, with the fasting rule exactly as given.

4. Tell the client when an appointment they already have is: call list_upcoming_appointments and answer from it (pet, day, time, vet). If it's a surgery or procedure, give the day and the drop-off window (${PROCEDURE_DROP_OFF_WINDOW}) and remind them about fasting (${PROCEDURE_FASTING_TEXT}), never the theatre time. If nothing upcoming matches what they asked about, say you can't see one on file and escalate so staff can check.
5. Move an existing ROUTINE CONSULT or VIDEO CONSULT to another date or time, when the client asks to reschedule. Call list_upcoming_appointments to find the one they mean. If exactly one fits what they said (the pet, the day), use it; if it's unclear which, ask ONE short question (e.g. "Is that Vader's booster on Friday the 23rd?"). Then check_consult_availability for the new date, offer real times (keep the same vet if they have times, otherwise offer others), and once the client picks one, call move_appointment. Confirm the new day and time plainly. If the appointment isn't movable (list_upcoming_appointments says why), escalate instead. 
6. Cancel an existing appointment when the client asks to. Find it with list_upcoming_appointments, then ask them to confirm, naming the pet, day and time (e.g. "Just to confirm, cancel Vader's consult on Friday 23 Oct at 10:30?"). Only once they clearly say yes, call cancel_appointment, confirm it's cancelled, and offer to book another time. If they're unsure, don't cancel.

A video consult is booked the same way as an in-person one — just tell the client a member of staff will be in touch with the video link closer to the appointment; you don't create the link yourself.

A routine vaccine, a wellness/annual check-up, a nail trim, or "just a general check" are all completely normal reasons to book a consult — treat them exactly like any other booking, no escalation needed just because the visit is nominally about the pet's health. Every vet visit is technically "about the pet's health"; that alone is never a reason to escalate.

A spay only applies to a female pet and a castration only to a male — if check_procedure_availability or book_procedure comes back with an error about the pet's sex (already spayed/neutered, or the wrong sex for what's being requested), say so plainly to the client rather than retrying with a different type or guessing around it.

Dental cleaning vs dental/extractions: if the client already knows which (e.g. a vet mentioned extractions, or they just want a routine cleaning), book that one directly. If they're not sure, ask them briefly which it sounds like before checking availability — never guess this yourself, since it changes how long the slot needs to be.

Escalate to staff immediately — via escalate_to_staff, with no attempt to answer yourself first — whenever:
- the client describes an actual symptom, illness, injury, or something currently wrong with the pet (vomiting, limping, not eating, a lump, an accident, etc.), however minor it sounds
- the client asks a medical question — what something means, what to do about it, whether to be worried, anything requiring clinical judgment
- the client mentions money already paid — a refund, a bill, an invoice, a disputed charge
- the client wants a surgery that isn't a standard spay/castration/dental (an emergency, or anything you can't cleanly fit to one of your procedure types)
- the client wants to move an appointment that isn't movable (a surgery or procedure, one within the next 24 hours, one already checked in)
- the pet they mean isn't clearly one of the ones listed above
- the client sounds upset, frustrated, or this could be an emergency
- anything else you're not confident falls within what you're actually allowed to do above

A tapped button is a request, not small talk. If the client's latest message is "Book Appointment" (the button on a vaccination reminder), they want to book: take the pet and vaccines from the most recent vaccination reminder in the conversation, however long ago it was sent, and treat it as a routine consult for that vaccination. Ask which day suits them and check availability; don't escalate. If there's no vaccination reminder in the conversation, ask which pet and what the visit is for.

An earlier question about a bill or payment that has already been dealt with (staff answered it, or a payment confirmation has since been sent) doesn't make a new, different request a money matter. Judge the client's latest message on what it asks for now.

A missing booking DETAIL is not one of those things, and is never a reason to escalate on its own. If the client is clearly trying to book and has already given you most of what's needed — a pet, a date/time (even roughly), what kind of visit — but one small thing is genuinely still missing or ambiguous (which of several pets, in-person vs video, which exact slot from a list you gave, dental cleaning vs extractions), don't escalate: ask ONE short, direct question for just that missing piece and wait for their answer, same as a receptionist would. And if they've already answered clearly enough that asking again would be pointless — they named the pet, picked an exact time from what you offered, said "please book that" — go ahead and book it; don't manufacture uncertainty as a reason to hand it off instead. Escalating is for the situations listed above, not for "needs one more answer."

If the client asks whether a specific vet is working for a routine consult, pass vet_name to check_consult_availability once you have a date — don't guess, and don't deflect if you can actually check. (check_procedure_availability has no vet filter — it always shows every open time for that procedure.)

Never state, list, or imply any availability (a date works, a time is free, there's nothing open, a vet is or isn't around) without having just called check_consult_availability or check_procedure_availability — whichever matches what's being asked about — for that exact date in this same reply, and your answer must exactly match what it returned. This applies EVEN IF an earlier message in this conversation — including one that looks like it came from you — already stated an answer about a date or time: that earlier statement may itself have been wrong, and if the client is asking again, re-checking, or you are about to repeat it, you must call the tool again right now rather than trust or restate it. Never summarize loosely, and never say "no availability" unless the tool's list of times was genuinely empty.

When in doubt, escalate — never guess, never promise something you can't actually do, never discuss another client's information. Keep replies short and warm, in the same language the client is writing in. Never use a long dash (the em dash or en dash character) anywhere in a reply; use a comma, a full stop or a new sentence instead. Never say you're an AI unless directly asked.`;
}

function historyRowToContent(row) {
  // A voice note's transcript (migration 196) reads like what they said.
  if (row.media_type === 'audio') return row.transcript ? `[voice note] ${row.transcript}` : '[sent a voice note]';
  if (row.body) return row.body;
  if (row.media_type === 'image') return '[sent a photo]';
  return '[message]';
}

// Handed over: the AI (or the unanswered sweep) flagged this thread for
// staff and no member of staff has replied since. While that holds, the AI
// doesn't answer at all; the client only gets the short "still with our
// team" line. It ends the moment staff reply or clear the flag, and the AI
// then joins in as normal again.
export async function threadHandedOver(threadKey, rows) {
  const { data: state } = await supabaseAdmin
    .from('client_message_thread_state')
    .select('flagged, escalated_at')
    .eq('thread_key', threadKey)
    .maybeSingle();
  if (!state?.flagged || !state.escalated_at) return false;
  const since = new Date(state.escalated_at).getTime();
  return !(rows || []).some((r) => r.sender === 'staff' && new Date(r.created_at).getTime() > since);
}

// Staff pressed "🤖 AI take over" (migration 197): the AI answers every
// client message itself, staff recently in the thread or not, until a
// member of staff writes again or the AI hands the thread back. Reads
// defensively, so a missing column just means "no takeover".
export async function aiTakeoverActive(threadKey, rows) {
  const { data: state, error } = await supabaseAdmin
    .from('client_message_thread_state')
    .select('ai_takeover_at')
    .eq('thread_key', threadKey)
    .maybeSingle();
  if (error || !state?.ai_takeover_at) return false;
  const since = new Date(state.ai_takeover_at).getTime();
  return !(rows || []).some((r) => r.sender === 'staff' && new Date(r.created_at).getTime() > since);
}

export async function endAiTakeover(threadKey) {
  const { error } = await supabaseAdmin
    .from('client_message_thread_state')
    .update({ ai_takeover_at: null })
    .eq('thread_key', threadKey);
  if (error && !/ai_takeover_at/.test(error.message || '')) console.error('Failed to end AI takeover', threadKey, error);
}

// Anthropic's Messages API expects strictly alternating user/assistant
// turns — 'staff' and 'ai' both count as the clinic's side (assistant),
// so two of those in a row (e.g. two staff replies before the client
// answered) need merging into one turn rather than sent as two.
function buildConversation(rows) {
  const messages = [];
  for (const row of rows) {
    const role = row.sender === 'client' ? 'user' : 'assistant';
    const content = historyRowToContent(row);
    const last = messages[messages.length - 1];
    if (last && last.role === role) {
      last.content += `\n${content}`;
    } else {
      messages.push({ role, content });
    }
  }
  return messages;
}

const MAX_TIMES_RETURNED = 12;

// Strips punctuation/extra whitespace before matching a vet name — a
// literal .includes() check found "Dr Jim" (how the model naturally wrote
// it after being asked "is dr jim around") did NOT match "Dr. Jim
// Bolssens" because of the period, silently filtering out every real
// slot and making a live-tested "is Dr Jim free" check wrongly report
// nothing available, for that vet OR anyone else (see toolCheckAvailability).
function normalizeForMatch(s) {
  return String(s || '').toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
}

function groupSlotsByTime(slots) {
  const byTime = new Map();
  for (const s of slots) {
    if (!byTime.has(s.start_time)) byTime.set(s.start_time, []);
    byTime.get(s.start_time).push({ vet_id: s.vet_id, vet_name: s.vet_name });
  }
  return [...byTime.entries()].map(([start_time, vets]) => ({ start_time, vets }));
}

// computeAvailableSlots returns one row PER VET per time — a genuinely
// open day can easily be 40+ near-identical entries, which is exactly
// what live testing showed the model mis-summarizing as "no availability"
// despite the data being right there. Collapsing to one row per distinct
// time (with which vet(s) are free then) gives the model a short,
// unambiguous list it can't misread, and directly supports "is a
// specific vet around" once a date's known via vet_name.
const MAX_FUTURE_DAYS = 180;

// A defense-in-depth check independent of the system prompt's date
// anchor — live testing found the model silently picking the wrong YEAR
// for a bare day+month with no year given ("23 September" → 2025 instead
// of 2026). A wrong-year date returns a perfectly legitimate but
// misleading EMPTY result (nothing's ever booked in the wrong year),
// which then reads exactly like genuine "no availability" and is
// impossible to catch from the result shape alone. Rejecting an
// implausible date here turns that into an explicit, unmissable error
// instead of a silent empty list.
function implausibleDateReason(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return 'not a valid YYYY-MM-DD date';
  const today = uaeTodayContext().split(', ')[1];
  if (dateStr < today) {
    return `${dateStr} is in the past (today is ${today}) — this is almost certainly the wrong year; re-check today's date and try again with the correct one`;
  }
  const maxDate = new Date(uaeNow().getTime() + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (dateStr > maxDate) {
    return `${dateStr} is more than ${MAX_FUTURE_DAYS} days from today (${today}) — this is almost certainly the wrong year; re-check today's date and try again with the correct one`;
  }
  return null;
}

async function toolCheckAvailability(input) {
  const dateIssue = implausibleDateReason(input?.date);
  if (dateIssue) return { ok: false, error: dateIssue };

  const appointmentType = input?.appointment_type === 'video' ? 'video' : 'consult';
  const result = await computeAvailableSlots(supabase, { date: input?.date, type: appointmentType });
  if (result.error) return { ok: false, error: result.error };

  const allTimes = groupSlotsByTime(result.slots || []);
  const vetFilter = normalizeForMatch(input?.vet_name);

  if (!vetFilter) {
    return {
      ok: true,
      date: input?.date,
      appointment_type: appointmentType,
      duration_minutes: result.duration_minutes,
      total_distinct_times: allTimes.length,
      // Capped so a busy day doesn't flood the model — plenty to offer a
      // client a few real options without needing every single one.
      times: allTimes.slice(0, MAX_TIMES_RETURNED),
    };
  }

  const filteredSlots = (result.slots || []).filter((s) => normalizeForMatch(s.vet_name).includes(vetFilter));
  const filteredTimes = groupSlotsByTime(filteredSlots);

  // Always includes the unfiltered list too, even when the requested vet
  // has nothing — so a "that vet's not free then" answer can still offer
  // real times with other vets, rather than the one vet's empty result
  // getting over-generalized into "nothing with anyone", which is exactly
  // what testing showed happening.
  return {
    ok: true,
    date: input?.date,
    appointment_type: appointmentType,
    duration_minutes: result.duration_minutes,
    requested_vet_name: input.vet_name,
    requested_vet_has_availability: filteredTimes.length > 0,
    times_for_requested_vet: filteredTimes.slice(0, MAX_TIMES_RETURNED),
    total_distinct_times_any_vet: allTimes.length,
    times_any_vet: allTimes.slice(0, MAX_TIMES_RETURNED),
  };
}

async function toolBookConsult(input, { clientId, patients }) {
  const dateIssue = implausibleDateReason(input?.date);
  if (dateIssue) return { ok: false, error: dateIssue };

  const patient = patients.find((p) => p.name.trim().toLowerCase() === String(input?.patient_name || '').trim().toLowerCase());
  if (!patient) {
    return { ok: false, error: `No pet named "${input?.patient_name}" found on this client's file.` };
  }

  const appointmentType = input?.appointment_type === 'video' ? 'video' : 'consult';

  // Re-derive the real slot from scratch rather than trusting the
  // start_time/vet_id the model echoed back — closes off a model mistake
  // (or a stale slot from earlier in a long conversation) actually
  // booking something that was never really available.
  const available = await computeAvailableSlots(supabase, { date: input?.date, type: appointmentType });
  if (available.error) return { ok: false, error: available.error };
  const slot = (available.slots || []).find((s) => s.start_time === input?.start_time && s.vet_id === input?.vet_id);
  if (!slot) return { ok: false, error: "That slot isn't available anymore — check availability again for a current list." };

  const startTime = new Date(slot.start_time);
  const endTime = new Date(startTime.getTime() + CONSULT_DURATION_MINUTES * 60000);

  // A video consult has no physical room at all (see
  // app/api/appointments/route.js's own booking rules) — the actual video
  // room is created later by staff at check-in, not at booking time.
  let roomId = null;
  if (appointmentType === 'consult') {
    const { data: rooms, error: roomsError } = await supabaseAdmin.from('rooms').select('id').eq('type', 'consult');
    if (roomsError) return { ok: false, error: roomsError.message };

    for (const room of rooms || []) {
      const { conflict, error } = await findAppointmentConflict(supabaseAdmin, { roomId: room.id, startTime, endTime });
      if (error) return { ok: false, error: error.message };
      if (!conflict) {
        roomId = room.id;
        break;
      }
    }
    if (!roomId) return { ok: false, error: 'No consult room is free at that time — check availability again.' };
  }

  const { conflict: vetConflict, error: vetConflictError } = await findAppointmentConflict(supabaseAdmin, {
    vetId: slot.vet_id,
    startTime,
    endTime,
  });
  if (vetConflictError) return { ok: false, error: vetConflictError.message };
  if (vetConflict) return { ok: false, error: 'That vet was just booked elsewhere — check availability again.' };

  const roster = await checkStaffRoster(supabaseAdmin, { vetId: slot.vet_id, date: input.date, shift: slot.shift });
  if (roster.error) return { ok: false, error: roster.error.message };
  if (roster.blocked) return { ok: false, error: `${roster.vetName} isn't on the roster for that day anymore — check availability again.` };

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert([
      {
        patient_id: patient.id,
        client_id: clientId,
        room_id: roomId,
        vet_id: slot.vet_id,
        type: appointmentType,
        start_time: startTime.toISOString(),
        duration_minutes: CONSULT_DURATION_MINUTES,
        reason: input.reason || null,
        booking_source: 'whatsapp_ai',
      },
    ])
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, appointment_id: data.id, patient_name: patient.name, vet_name: slot.vet_name, start_time: slot.start_time, appointment_type: appointmentType };
}

// Resolves a pet by name and checks the requested procedure type actually
// makes sense for it (right species/weight for duration, right sex — a
// spay only for a female, a castration only for a male) before ever
// touching computeAvailableSlots — shared by both procedure tools below so
// neither can drift from the other's validation.
function resolveProcedurePatient(input, patients) {
  const patient = patients.find((p) => p.name.trim().toLowerCase() === String(input?.patient_name || '').trim().toLowerCase());
  if (!patient) return { error: `No pet named "${input?.patient_name}" found on this client's file.` };
  if (!PROCEDURE_TYPES.includes(input?.appointment_type)) {
    return { error: `appointment_type must be one of ${PROCEDURE_TYPES.join(', ')}.` };
  }
  if (!appointmentTypeAllowedForSex(input.appointment_type, patient.sex)) {
    return {
      error:
        input.appointment_type === 'spay'
          ? `${patient.name} isn't on file as female (or is already spayed) — a spay doesn't apply here.`
          : `${patient.name} isn't on file as male (or is already castrated) — a castration doesn't apply here.`,
    };
  }
  return { patient };
}

async function toolCheckProcedureAvailability(input, { patients }) {
  const dateIssue = implausibleDateReason(input?.date);
  if (dateIssue) return { ok: false, error: dateIssue };

  const { patient, error: patientError } = resolveProcedurePatient(input, patients);
  if (patientError) return { ok: false, error: patientError };

  const result = await computeAvailableSlots(supabase, {
    date: input?.date,
    type: input.appointment_type,
    species: patient.species,
    weightKg: patient.weight_kg,
  });
  if (result.error) return { ok: false, error: result.error };

  return {
    ok: true,
    date: input?.date,
    appointment_type: input.appointment_type,
    patient_name: patient.name,
    duration_minutes: result.duration_minutes,
    times: groupSlotsByTime(result.slots || []).slice(0, MAX_TIMES_RETURNED),
  };
}

async function toolBookProcedure(input, { clientId, patients }) {
  const dateIssue = implausibleDateReason(input?.date);
  if (dateIssue) return { ok: false, error: dateIssue };

  const { patient, error: patientError } = resolveProcedurePatient(input, patients);
  if (patientError) return { ok: false, error: patientError };

  // Re-derive the real slot from scratch rather than trusting the
  // start_time/vet_id the model echoed back — same reasoning as
  // toolBookConsult above.
  const available = await computeAvailableSlots(supabase, {
    date: input?.date,
    type: input.appointment_type,
    species: patient.species,
    weightKg: patient.weight_kg,
  });
  if (available.error) return { ok: false, error: available.error };
  const slot = (available.slots || []).find((s) => s.start_time === input?.start_time && s.vet_id === input?.vet_id);
  if (!slot) return { ok: false, error: "That slot isn't available anymore — check availability again for a current list." };

  const startTime = new Date(slot.start_time);
  const endTime = new Date(startTime.getTime() + slot.duration_minutes * 60000);

  const { data: rooms, error: roomsError } = await supabaseAdmin.from('rooms').select('id').eq('type', 'surgery');
  if (roomsError) return { ok: false, error: roomsError.message };

  let roomId = null;
  for (const room of rooms || []) {
    const { conflict, error } = await findAppointmentConflict(supabaseAdmin, { roomId: room.id, startTime, endTime });
    if (error) return { ok: false, error: error.message };
    if (!conflict) {
      roomId = room.id;
      break;
    }
  }
  if (!roomId) return { ok: false, error: 'No surgery room is free at that time — check availability again.' };

  const { conflict: vetConflict, error: vetConflictError } = await findAppointmentConflict(supabaseAdmin, {
    vetId: slot.vet_id,
    startTime,
    endTime,
  });
  if (vetConflictError) return { ok: false, error: vetConflictError.message };
  if (vetConflict) return { ok: false, error: 'That vet was just booked elsewhere — check availability again.' };

  const roster = await checkStaffRoster(supabaseAdmin, { vetId: slot.vet_id, date: input.date, shift: slot.shift });
  if (roster.error) return { ok: false, error: roster.error.message };
  if (roster.blocked) return { ok: false, error: `${roster.vetName} isn't on the roster for that day anymore — check availability again.` };

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert([
      {
        patient_id: patient.id,
        client_id: clientId,
        room_id: roomId,
        vet_id: slot.vet_id,
        type: 'surgery',
        start_time: startTime.toISOString(),
        duration_minutes: slot.duration_minutes,
        reason: input.reason || `Client-requested ${CLIENT_APPOINTMENT_TYPE_LABELS[input.appointment_type] || input.appointment_type}`,
        booking_source: 'whatsapp_ai',
      },
    ])
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  // Returned to the model alongside the booking so its confirmation tells
  // the client what actually matters for a procedure — the morning
  // drop-off window and fasting — instead of the internal theatre slot
  // time, which isn't when they should arrive (same instructions as the
  // procedure_reminder template, from the same constants).
  return {
    ok: true,
    appointment_id: data.id,
    patient_name: patient.name,
    vet_name: slot.vet_name,
    date: input.date,
    client_instructions: {
      drop_off: `Bring the pet in between ${PROCEDURE_DROP_OFF_WINDOW} on the day. There is no set appointment time.`,
      fasting: `The pet must be fasting: ${PROCEDURE_FASTING_TEXT}`,
    },
  };
}

const MOVE_MIN_NOTICE_MS = 24 * 60 * 60 * 1000;

function dubaiDayTime(iso) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }),
    weekday: d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Dubai' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }),
  };
}

// Why an appointment can't be moved by the concierge (null = it can).
function whyNotMovable(appt, now = Date.now()) {
  if (!['consult', 'video'].includes(appt.type)) return 'a surgery or procedure: staff move these (fasting and drop-off)';
  if (appt.status !== 'booked') return `it is ${appt.status.replace('_', ' ')}`;
  if (new Date(appt.start_time).getTime() - now < MOVE_MIN_NOTICE_MS) return 'it is within the next 24 hours';
  if (Number(appt.duration_minutes) !== CONSULT_DURATION_MINUTES) return 'it is a longer, specially booked consult';
  return null;
}

async function toolListUpcomingAppointments({ clientId }) {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('id, type, status, start_time, duration_minutes, reason, patients(name), staff(full_name)')
    .eq('client_id', clientId)
    .in('status', ['booked', 'checked_in'])
    .gte('start_time', new Date().toISOString())
    .order('start_time')
    .limit(10);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    appointments: (data || []).map((a) => {
      const why = whyNotMovable(a);
      return {
        appointment_id: a.id,
        pet: a.patients?.name || null,
        type: CLIENT_APPOINTMENT_TYPE_LABELS[a.type] || a.type,
        ...dubaiDayTime(a.start_time),
        vet: a.staff?.full_name || null,
        reason: a.reason || null,
        movable: !why,
        ...(why ? { why_not: why } : {}),
      };
    }),
  };
}

// Moves the appointment in place (same row, same pet, same type), after
// re-deriving the new slot from scratch exactly like toolBookConsult, so a
// stale or invented time can never be written.
async function toolMoveAppointment(input, { clientId }) {
  const dateIssue = implausibleDateReason(input?.date);
  if (dateIssue) return { ok: false, error: dateIssue };

  const { data: appt, error: apptError } = await supabaseAdmin
    .from('appointments')
    .select('id, client_id, type, status, start_time, duration_minutes, room_id, vet_id')
    .eq('id', input?.appointment_id)
    .maybeSingle();
  if (apptError) return { ok: false, error: apptError.message };
  if (!appt || appt.client_id !== clientId) return { ok: false, error: "That appointment isn't one of this client's." };
  const why = whyNotMovable(appt);
  if (why) return { ok: false, error: `This appointment can't be moved by you (${why}); escalate to staff.` };

  const available = await computeAvailableSlots(supabase, { date: input.date, type: appt.type });
  if (available.error) return { ok: false, error: available.error };
  const slot = (available.slots || []).find((s) => s.start_time === input?.start_time && s.vet_id === input?.vet_id);
  if (!slot) return { ok: false, error: "That slot isn't available anymore, check availability again for a current list." };

  const startTime = new Date(slot.start_time);
  const endTime = new Date(startTime.getTime() + CONSULT_DURATION_MINUTES * 60000);

  let roomId = null;
  if (appt.type === 'consult') {
    const { data: rooms, error: roomsError } = await supabaseAdmin.from('rooms').select('id').eq('type', 'consult');
    if (roomsError) return { ok: false, error: roomsError.message };
    for (const room of rooms || []) {
      const { conflict, error } = await findAppointmentConflict(supabaseAdmin, { roomId: room.id, startTime, endTime, excludeId: appt.id });
      if (error) return { ok: false, error: error.message };
      if (!conflict) {
        roomId = room.id;
        break;
      }
    }
    if (!roomId) return { ok: false, error: 'No consult room is free at that time, check availability again.' };
  }

  const { conflict: vetConflict, error: vetConflictError } = await findAppointmentConflict(supabaseAdmin, {
    vetId: slot.vet_id,
    startTime,
    endTime,
    excludeId: appt.id,
  });
  if (vetConflictError) return { ok: false, error: vetConflictError.message };
  if (vetConflict) return { ok: false, error: 'That vet was just booked elsewhere, check availability again.' };

  const roster = await checkStaffRoster(supabaseAdmin, { vetId: slot.vet_id, date: input.date, shift: slot.shift });
  if (roster.error) return { ok: false, error: roster.error.message };
  if (roster.blocked) return { ok: false, error: `${roster.vetName} isn't on the roster for that day anymore, check availability again.` };

  const { error } = await supabaseAdmin
    .from('appointments')
    .update({ start_time: startTime.toISOString(), vet_id: slot.vet_id, room_id: roomId, reminder_sent_at: null })
    .eq('id', appt.id)
    .eq('status', 'booked');
  if (error) return { ok: false, error: error.message };
  return { ok: true, appointment_id: appt.id, moved_from: dubaiDayTime(appt.start_time), moved_to: dubaiDayTime(slot.start_time), vet_name: slot.vet_name };
}

async function toolCancelAppointment(input, { clientId }) {
  const { data: appt, error: apptError } = await supabaseAdmin
    .from('appointments')
    .select('id, client_id, status, start_time, type, patients(name)')
    .eq('id', input?.appointment_id)
    .maybeSingle();
  if (apptError) return { ok: false, error: apptError.message };
  if (!appt || appt.client_id !== clientId) return { ok: false, error: "That appointment isn't one of this client's." };
  if (appt.status !== 'booked') return { ok: false, error: `It is ${appt.status.replace('_', ' ')}, so it can't be cancelled; escalate to staff.` };
  if (new Date(appt.start_time).getTime() < Date.now()) return { ok: false, error: 'That appointment is in the past.' };
  const { error } = await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id).eq('status', 'booked');
  if (error) return { ok: false, error: error.message };
  return { ok: true, cancelled: { pet: appt.patients?.name || null, ...dubaiDayTime(appt.start_time) } };
}

async function runTool(use, ctx) {
  if (use.name === 'check_consult_availability') return toolCheckAvailability(use.input);
  if (use.name === 'check_procedure_availability') return toolCheckProcedureAvailability(use.input, ctx);
  if (use.name === 'book_consult' || use.name === 'book_procedure') {
    // Traced dry-runs (see maybeRunConcierge's trace param, and
    // app/api/whatsapp/concierge-trace) exist purely to watch the model's
    // real behavior without side effects — never actually book a real
    // appointment from one.
    if (ctx.dryRun) return { ok: false, error: 'Booking skipped — this is a dry-run trace, not a real request.' };
    return use.name === 'book_consult' ? toolBookConsult(use.input, ctx) : toolBookProcedure(use.input, ctx);
  }
  if (use.name === 'list_upcoming_appointments') return toolListUpcomingAppointments(ctx);
  if (use.name === 'cancel_appointment') {
    if (ctx.dryRun) return { ok: false, error: 'Cancel skipped: this is a dry-run trace, not a real request.' };
    return toolCancelAppointment(use.input, ctx);
  }
  if (use.name === 'move_appointment') {
    if (ctx.dryRun) return { ok: false, error: 'Move skipped: this is a dry-run trace, not a real request.' };
    return toolMoveAppointment(use.input, ctx);
  }
  return { ok: false, error: 'unknown tool' };
}

// A second, mechanical line of defense on top of the system prompt's
// grounding rule — live testing showed the model restating an earlier
// wrong "no availability" answer of its own that was sitting in the
// conversation history, sometimes even in a round where it DID call
// check_consult_availability and got real times back. An instruction
// alone clearly wasn't reliable enough for something this safety-
// relevant, so any reply that sounds like an availability claim gets
// rejected unless it's backed by this run's own tool result — not
// perfect (English-language patterns only), but a real backstop rather
// than just hoping the model complies.
const AVAILABILITY_CLAIM_PATTERN =
  /\bno\b[^.!?\n]{0,30}\b(slots?|availability|times?|openings?)\b|\bfully booked\b|\bnot available\b|\bisn'?t (?:around|available|working)\b|\bis (?:not|n't) (?:around|available|working)\b/i;

// How long a staff reply keeps the concierge out of a thread. Used to be
// unbounded — any staff row right before the client's message counted as
// "staff already engaged", so a staff message from two days earlier
// silently blocked the concierge on a brand-new appointment request (a
// real incident: the client waited ~11 minutes for the unanswered-message
// sweep to surface it to a human). Two hours is long enough never to talk
// over someone mid-conversation, short enough that a stale exchange
// doesn't keep the AI out of the next one.
const STAFF_HANDOFF_WINDOW_MS = 2 * 60 * 60 * 1000;

// Looks at the clinic side's LATEST reply — staff or AI, skipping client
// messages and automated 'system' rows (reminders etc.) — not just the
// row right before the newest message, which let the first message of a
// burst be blocked while a follow-up 12 seconds later wasn't. Handed off
// only if that reply is from staff, not the AI, and recent enough to mean
// they're still actively in the thread.
export function staffRecentlyEngaged(rows, now = Date.now()) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.sender !== 'staff' && row.sender !== 'ai') continue;
    if (row.is_notice) continue; // an automatic holding notice isn't the AI taking over (migration 194)
    if (row.sender === 'ai') return false;
    const sentAt = new Date(row.created_at).getTime();
    return Number.isFinite(sentAt) && now - sentAt < STAFF_HANDOFF_WINDOW_MS;
  }
  return false;
}

// Runs the concierge for one freshly-inserted inbound WhatsApp message and
// returns what happened — { skipped, sent, escalated } with a `reason` on
// the latter two — for the webhook to log. Never throws: any internal
// failure comes back as { skipped: true, reason: 'error: ...' } so a bug
// here can never take the webhook itself down.
//
// Every result also carries `trace`: one entry per round, with exactly
// what tool(s) were called, their inputs/outputs, and any text produced —
// the ground truth of what actually happened, instead of inferring it
// from a WhatsApp screenshot after the fact. See
// app/api/whatsapp/concierge-trace for a staff-facing dry run
// (dryRun: true) that exposes this without sending or booking anything
// real, built after several rounds of prompt/logic fixes each looking
// right but not visibly fixing the live symptom — this makes the actual
// behavior directly inspectable instead of guessed at again.
// TOOLS with long dashes stripped from every description the model reads
// (same reasoning as the system prompt, see maybeRunConcierge).
const TOOLS_FOR_MODEL = JSON.parse(withoutDashes(JSON.stringify(TOOLS)));

export async function maybeRunConcierge({ clientId, phone, dryRun = false, replayLastClientMessage = false, force = false }) {
  const trace = [];
  if (!isWhatsAppAiEnabled() || !clientId) return { skipped: true, reason: 'not eligible', trace };

  try {
    // A replay needs to search further back than the normal context
    // window to find the last real client row — after enough back-and-
    // forth testing, the newest HISTORY_LIMIT rows (even a few multiples
    // of it) can be entirely staff/ai, which would otherwise empty the
    // window out before ever reaching a client message. A debug-only
    // tool, so a generously large one-off fetch is fine.
    const fetchLimit = replayLastClientMessage ? 200 : HISTORY_LIMIT;

    const [{ data: client }, { data: patients }, { data: clinicSettings }, { data: history, error: historyError }] = await Promise.all([
      supabase.from('clients').select('full_name').eq('id', clientId).maybeSingle(),
      supabase
        .from('patients')
        .select('id, name, species, sex, weight_kg')
        .eq('client_id', clientId)
        .eq('deceased', false)
        .eq('rehomed', false),
      supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
      supabase
        .from('client_messages')
        .select('sender, body, media_type, created_at, is_notice, transcript')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(fetchLimit),
    ]);

    if (historyError) return { skipped: true, reason: `history lookup failed: ${historyError.message}`, trace };

    let rows = (history || []).slice().reverse();
    // For a debug replay (see app/api/whatsapp/concierge-trace) the real
    // latest row is usually the concierge's OWN most recent reply, not a
    // new client message — there's nothing to "respond to" as-is. Trim
    // back to the last real client message so the exact turn that's being
    // debugged can be re-run without needing a fresh live WhatsApp message
    // (never used on the real webhook path, only from the trace route),
    // then cap back down to the normal context window size.
    if (replayLastClientMessage) {
      while (rows.length && rows[rows.length - 1].sender !== 'client') rows.pop();
      if (rows.length > HISTORY_LIMIT) rows = rows.slice(rows.length - HISTORY_LIMIT);
    }
    // A staff member actively replying in this thread means a human has
    // taken it over — never talk over them. See staffRecentlyEngaged for
    // why that's time-boxed rather than any staff row at all.
    // force: a member of staff pressed "AI answer" on this thread (see
    // app/api/whatsapp/concierge-answer), so their own recent replies
    // aren't a reason to stay out.
    const aiOwnsThread = !force && (await aiTakeoverActive(clientId, rows));
    if (!force && !aiOwnsThread && (await threadHandedOver(clientId, rows))) {
      return { skipped: true, withStaff: true, reason: 'already handed to staff, waiting on their reply', trace };
    }
    if (!force && !aiOwnsThread && staffRecentlyEngaged(rows)) return { skipped: true, handoff: true, reason: 'staff already engaged in this thread', trace };

    const messages = buildConversation(rows);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return { skipped: true, reason: 'no client message to respond to', trace };
    }

    // Long dashes stripped from everything the model reads, not just what it
    // writes: it mirrors the punctuation of its own instructions, so a prompt
    // full of them invites them back in replies (see lib/noDashes.js).
    const system = withoutDashes(
      buildSystemPrompt({ clientName: client?.full_name, patients: patients || [], clinicSettings }) +
        (force
          ? "\n\nA member of staff has looked at this conversation and asked you to answer the client's latest message yourself. Reply to it directly: book, check availability, or ask the one question you need. Only use escalate_to_staff if the client describes a symptom or illness, asks a medical question, or this could be an emergency."
          : '')
    );
    const ctx = { clientId, patients: patients || [], dryRun };
    let checkedAvailabilityThisRun = false;
    // The actual result of the most recent check_consult_availability call
    // this run — not just whether one happened. A conversation this heavy
    // with the model's OWN earlier false "no availability" claims (each
    // one still sitting right there in history) can pull it toward
    // repeating that pattern even in a round where it DID call the tool
    // and got real times back — "was the tool called" alone doesn't catch
    // that, only comparing what it said against what the tool actually
    // returned does.
    let lastAvailability = null; // { hasOpenings, timesText }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        tools: TOOLS_FOR_MODEL,
        messages,
        output_config: { effort: 'medium' },
      });

      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      const traceEntry = { round, tool_calls: toolUses.map((u) => ({ name: u.name, input: u.input })) };
      trace.push(traceEntry);

      if (toolUses.length === 0) {
        const text = response.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        traceEntry.text = text || null;
        if (!text) return { skipped: true, reason: 'model produced no reply', trace };

        const soundsLikeNoAvailability = AVAILABILITY_CLAIM_PATTERN.test(text);
        const neverChecked = !checkedAvailabilityThisRun;
        const contradictsRealResult = Boolean(lastAvailability?.hasOpenings);

        if (soundsLikeNoAvailability && (neverChecked || contradictsRealResult) && round < MAX_TOOL_ROUNDS - 1) {
          // See the comments above — reject this instead of sending it,
          // and if the tool actually did return real times, hand them
          // over explicitly so there's no room left to ignore them.
          traceEntry.rejected = contradictsRealResult ? 'contradicted its own tool result' : 'no availability check made yet';
          messages.push({ role: 'assistant', content: response.content });
          messages.push({
            role: 'user',
            content: contradictsRealResult
              ? `That's not correct — check_consult_availability just returned real open times for that date: ${lastAvailability.timesText}. Do not say there is no availability; offer some of these times to the client instead.`
              : "Before saying anything about availability, you must call check_consult_availability right now for the exact date in question and base your answer only on what it returns — do not repeat or rely on anything said earlier in this conversation.",
          });
          continue;
        }

        return { sent: true, reply: text, trace };
      }

      const escalate = toolUses.find((u) => u.name === 'escalate_to_staff');
      if (escalate) {
        return { escalated: true, reason: escalate.input?.reason || 'unspecified', trace };
      }

      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      traceEntry.tool_results = [];
      for (const use of toolUses) {
        const result = await runTool(use, ctx);
        traceEntry.tool_results.push({ name: use.name, result });
        if (use.name === 'check_consult_availability' || use.name === 'check_procedure_availability') {
          checkedAvailabilityThisRun = true;
          if (result.ok) {
            const openTimes = result.times || result.times_any_vet || [];
            lastAvailability = {
              hasOpenings: openTimes.length > 0,
              timesText:
                openTimes
                  .slice(0, 6)
                  .map((t) => `${t.start_time} (${(t.vets || []).map((v) => v.vet_name).join(', ')})`)
                  .join('; ') || 'none',
            };
          }
        }
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: withoutDashes(JSON.stringify(result)) });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return { escalated: true, reason: 'could not resolve this within the tool-call budget', trace };
  } catch (err) {
    return { skipped: true, reason: `error: ${err.message}`, trace };
  }
}

// Lets the client know a human will follow up, instead of leaving them
// with total silence right after an active back-and-forth — sent live
// over WhatsApp but deliberately NOT logged as a client_messages row:
// logging it with sender 'ai' would flip the thread's `pending` flag
// (see app/api/client-messages — derived from the LAST row's sender) to
// false, hiding from staff exactly the message that most needs their
// attention. The original client message stays the last real row, so it
// keeps showing the normal 🔔 needs-attention highlight. A failure here
// (e.g. outside WhatsApp's 24h free-form reply window) is swallowed —
// losing this courtesy note is fine; it must never affect whether the
// escalation itself gets flagged.
// Every automatic notice the client gets is also saved in the thread
// (migration 194), so staff can always see exactly what was sent. Marked
// is_notice, which the inbox 🔔, the unanswered sweep and
// staffRecentlyEngaged all look past: the thread still reads as waiting
// on a person, exactly as it did when these weren't logged at all.
export async function sendAndLogNotice(phone, text, clientId = null) {
  const waMessageId = await sendWhatsAppText(phone, text);
  const { error } = await supabaseAdmin.from('client_messages').insert([
    { client_id: clientId || null, phone, channel: 'whatsapp', sender: 'ai', body: text, wa_message_id: waMessageId || null, status: 'sent', is_notice: true },
  ]);
  if (error) console.error('Failed to log WhatsApp notice', phone, error);
}

export async function sendEscalationNotice(phone, clientId = null) {
  try {
    await sendAndLogNotice(
      phone,
      "Thanks, a member of our team will be with you shortly.",
      clientId
    );
  } catch (err) {
    console.error('Failed to send WhatsApp escalation notice', phone, err);
  }
}

// Sent instead of sendEscalationNotice above when the thread was ALREADY
// flagged — a client whose follow-up message(s) also escalate (e.g. "This
// is for May, tomorrow at 10:45 with dr Jim is good", then "Please book
// that", then "Hello", each on its own escalating turn) used to get
// nothing at all for any message after the first: the one-time-notice
// logic was built to stop a rapid burst from repeating the exact same
// line three times in a row, but it had no expiry and no fallback, so it
// silently absorbed every later message too, indefinitely, with zero
// indication to the client that "Please book that" ever landed — see the
// incident behind this comment. Short and distinct from the first-time
// notice on purpose, so a client who keeps writing while waiting doesn't
// just get the identical sentence echoed back each time.
export async function sendEscalationFollowUpNotice(phone, clientId = null) {
  try {
    await sendAndLogNotice(phone, "Still with our team on this, they'll be with you shortly.", clientId);
  } catch (err) {
    console.error('Failed to send WhatsApp escalation follow-up notice', phone, err);
  }
}

// Sent when the concierge stays out of a thread because a staff member is
// already actively engaged in it (see the priorRow check above) — this
// used to be a pure, silent skip: nothing sent, nothing flagged, the
// client's message just sitting there with no sign it landed. Deliberately
// worded as a concrete action rather than a generic "someone will get back
// to you" line, so it reads as the message having actually been received
// and acted on, not brushed off — the whole reason this exists is so a
// client is never left wondering if anyone saw what they wrote.
export async function sendStaffHandoffNotice(phone, clientId = null) {
  try {
    await sendAndLogNotice(phone, "Thanks, a member of our team will be with you shortly.", clientId);
  } catch (err) {
    console.error('Failed to send WhatsApp staff-handoff notice', phone, err);
  }
}

// Marks a WhatsApp thread as flagged for staff (see
// app/api/client-messages/thread-state and migrations/140) whenever the
// concierge hands a conversation off — escalate_to_staff intentionally
// sends the client nothing itself (see TOOLS above), so without this an
// escalated thread looks exactly like any other unanswered message in the
// inbox, with nothing marking it as something the AI specifically kicked
// to a human rather than just a message nobody's gotten to yet.
// Independent of sendEscalationNotice/sendEscalationFollowUpNotice below —
// staff must see this even if the WhatsApp courtesy text fails to send.
// Returns whether the thread was already flagged, so the caller can send
// the short follow-up line instead of repeating the full first-time
// notice on a burst of several escalating messages in the same still-open
// episode — but it always sends something; see
// sendEscalationFollowUpNotice's own comment for why silence isn't an
// option here.
//
// threadKey is whatever the caller's already using to identify this
// conversation — a client_id for a matched client, or the app's
// `phone:<number>` shape for an unmatched one (see
// lib/whatsappUnanswered.js, which is the one caller that needs the
// latter; every real-time concierge path always has a matched client).
export async function flagEscalatedThread(threadKey, reason = null) {
  try {
    const { data: existing, error: readError } = await supabaseAdmin
      .from('client_message_thread_state')
      .select('flagged')
      .eq('thread_key', threadKey)
      .maybeSingle();
    if (readError) throw readError;

    const { error } = await supabaseAdmin
      .from('client_message_thread_state')
      .upsert(
        [
          {
            thread_key: threadKey,
            flagged: true,
            updated_at: new Date().toISOString(),
            // Why the AI handed this over (migration 186), shown on the
            // thread so staff don't have to guess.
            escalation_reason: reason ? String(reason).slice(0, 300) : null,
            escalated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'thread_key' }
      );
    if (error) throw error;
    // The AI handing a thread back ends any "AI take over" (migration 197).
    await endAiTakeover(threadKey);

    return { alreadyFlagged: Boolean(existing?.flagged) };
  } catch (err) {
    console.error('Failed to flag escalated WhatsApp thread', threadKey, err);
    return { alreadyFlagged: false };
  }
}

// Sends the concierge's reply live over WhatsApp and logs it with its own
// 'ai' sender (see migrations/132) — split out from maybeRunConcierge so
// the webhook can log/ignore a skip or escalation without ever calling
// this, and so a send failure here is caught in one obvious place.
export async function sendConciergeReply({ clientId, phone, reply: rawReply }) {
  const reply = withoutDashes(rawReply);
  const waMessageId = await sendWhatsAppText(phone, reply);
  const { error } = await supabaseAdmin.from('client_messages').insert([
    {
      client_id: clientId,
      phone,
      channel: 'whatsapp',
      sender: 'ai',
      body: reply,
      wa_message_id: waMessageId,
      status: 'sent',
    },
  ]);
  if (error) throw error;
}
