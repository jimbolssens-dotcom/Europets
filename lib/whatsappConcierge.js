// lib/whatsappConcierge.js
// The WhatsApp AI concierge. Every message a client sends (text, a tapped
// button, a voice note, a photo, a reaction), from a client on file or a
// number we don't know yet, goes to maybeRunConcierge, which reads the whole
// conversation plus the situation (the time and whether we're open, who has
// the conversation, what the client has already been told, their
// appointments and any pet staying with us) and decides one thing:
//   - reply itself: answer a clinic question, check availability, book,
//     move or cancel a routine consult or a standard procedure, or tell the
//     client about an appointment on file;
//   - hand to staff, with a holding message it writes for what the client
//     said (or none, when they've already been told);
//   - stay silent, when nothing needs saying.
// A second look checks each decision before it's carried out
// (applyConciergeDecision). Jim, after a week of fixed lines: "why does
// everything have to be predetermined?" So the AI writes every message;
// code only keeps the hard limits:
//   - the tools are the only actions it can take, and each booking is
//     re-validated server-side against computeAvailableSlots
//     (lib/appointmentBooking.js), never trusted from the conversation;
//   - availability is only ever stated from a tool result;
//   - anything medical, money, results or uncertain goes to staff;
//   - while staff have a conversation (or for an unknown number) it can only
//     hand over or stay silent;
//   - at most one holding message per wait, none within an hour of a staff
//     message (lib/clientAcknowledgement.js);
//   - if it fails, the thread is flagged and a short fixed line goes out.
//
// Gated off entirely unless WHATSAPP_AI_ENABLED=true is set: the kill
// switch, no redeploy required.

import { INSTAGRAM_HANDLE, INSTAGRAM_INVITE_DAYS } from '@/lib/clinicSocial';
import { anthropic } from './anthropicClient';
import { supabase } from './supabaseClient';
import { supabaseAdmin } from './supabaseAdmin';
import { sendWhatsAppText, PROCEDURE_DROP_OFF_WINDOW, PROCEDURE_FASTING_TEXT } from './metaWhatsapp';
import { withoutDashes } from './noDashes';
import { clinicMapsUrl, withMapsLink } from './clinicMaps';
import { burstIsAcknowledgementOnly, isSticker, noticeNotNeeded, noticeCoversWait, secondNoticeAllowed } from './clientAcknowledgement';
import { clinicClosedAt, fallbackHoldingText } from './clinicHours';
import { describeSituation, whyNotMovable, whyNotMovableTo, onlyToAnotherDay, movableNote } from './conciergeSituation';
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
    name: 'hand_to_staff',
    description:
      'Hand this conversation to a member of staff instead of answering yourself. Use it for anything medical or symptom-related, money already paid, test results, a pet staying with us, a non-standard surgery, an appointment you cannot move or cancel, a photo, video or file, or anything you are not fully confident about. Write message_to_client yourself (see How to respond), or leave it empty to send nothing.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short internal note for staff on why this needs a person. Not shown to the client.' },
        message_to_client: { type: 'string', description: 'What the client is told now, written for what they said and the time of day. Empty to send nothing.' },
        new_question: {
          type: 'boolean',
          description: 'True only when the client has already been told someone will get back to them, and this is a new, different question from that one. Allows one more short message in the same wait.',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'send_intake_link',
    description:
      "Only for a number that isn't a client on file yet. Gets their personal new-client form link (a new one, or the one already sent to this number if they haven't filled it in). The form registers them and their pet and says what they'd like booked and when; staff then confirm the booking. Put the link in your message.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'stay_silent',
    description: 'Send nothing: nothing in the latest message needs a reply (a thank-you, an ok, an emoji, a reaction or sticker after things are settled), or staff are handling it with nothing new for them.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Short internal note on why nothing needs saying.' } },
      required: ['reason'],
    },
  },
];

// UAE is UTC+4, no DST — shifting the raw UTC clock by that offset and
// then reading its UTC-labeled fields back off is a reliable way to get
// "today" in the clinic's own local time regardless of the server
// process's own timezone (same trick as uaeIso in appointmentBooking.js).
function uaeNow(at = Date.now()) {
  return new Date(at + 4 * 60 * 60 * 1000);
}

function uaeTodayContext(at = Date.now()) {
  const now = uaeNow(at);
  const dateStr = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `${weekday}, ${dateStr}`;
}

function buildSystemPrompt({ clientName, patients, clinicSettings, facts = '', now = Date.now(), unregistered = false }) {
  const petList = patients.length
    ? patients.map((p) => `- ${p.name} (${p.species}${p.sex && p.sex !== 'unknown' ? `, ${p.sex}` : ''})`).join('\n')
    : unregistered
      ? "(this number isn't linked to a client on file)"
      : '(none on file yet)';

  return `You are the WhatsApp concierge for ${clinicSettings?.legal_name || 'the clinic'}, a veterinary clinic in the UAE, messaging ${clientName || (unregistered ? 'someone whose number we do not have on file' : 'a client')} on their own WhatsApp number.

Today is ${uaeTodayContext(now)}, in the clinic's own local time (UAE, UTC+4). Always resolve "today", "tomorrow", "this/next [weekday]", or a bare day+month with no year (e.g. "23 September") against THIS date — never guess, assume, or default to a different year. Live testing found this go wrong exactly once: it's the single most important fact in this prompt.

This client's pets on file:
${petList}
${facts}
Clinic info you may share:
- Address: ${clinicSettings?.address || 'not on file — say you\'ll have someone confirm'}
- Google Maps link: ${clinicMapsUrl()} (whenever someone asks for the location, address or directions, send the address AND this link, on its own line)
- Phone: ${clinicSettings?.phone || 'not on file — say you\'ll have someone confirm'}

What you may do, and NOTHING else:
1. Answer simple factual questions about the clinic using only the info above.
2. Check availability for, and book, a ROUTINE CONSULT or VIDEO CONSULT (always exactly 15 minutes, same hours and doctors either way) for one of the pets listed above, using check_consult_availability/book_consult with appointment_type set to 'consult' (default) or 'video'. If the client doesn't say which, ask — don't assume either way.
3. Check availability for, and book, a SPAY, CASTRATION, DENTAL CLEANING, or DENTAL/EXTRACTIONS for one of the pets listed above, using check_procedure_availability/book_procedure. These run in their own, separate morning surgery window — narrower than a plain consult's hours, and never assumable; always check first.

After book_procedure succeeds, confirm the DATE only — never quote the slot's start_time to the client, since it's an internal theatre schedule, not an arrival time. In the same confirmation, pass on both client_instructions from its result clearly: the drop-off window (no set appointment time) and that the pet must be fasting, with the fasting rule exactly as given.

4. Tell the client when an appointment they already have is: call list_upcoming_appointments and answer from it (pet, day, time, vet). If it's a surgery or procedure, give the day and the drop-off window (${PROCEDURE_DROP_OFF_WINDOW}) and remind them about fasting (${PROCEDURE_FASTING_TEXT}), never the theatre time. If nothing upcoming matches what they asked about, say you can't see one on file and hand it to staff so they can check. Whenever the client mentions or asks about an appointment they have or think they have, or asks what a reminder was about (e.g. "what surgery?" right after a surgery reminder, or "I think I already have one on the 23rd, can I move it?"), call list_upcoming_appointments FIRST and answer from it, or move it under rule 5. Never answer that with a line about checking availability, and never hand it over just because the client isn't sure of their own booking. Only the medical details of a procedure (why it's being done, what it involves) go to staff.
5. Move an existing ROUTINE CONSULT or VIDEO CONSULT to another date or time, when the client asks to reschedule. Call list_upcoming_appointments to find the one they mean. If exactly one fits what they said (the pet, the day), use it; if it's unclear which, ask ONE short question (e.g. "Is that Vader's booster on Friday the 23rd?"). Then check_consult_availability for the new date, offer real times (keep the same vet if they have times, otherwise offer others), and once the client picks one, call move_appointment. Confirm the new day and time plainly. Check that it's movable BEFORE offering any new times: if list_upcoming_appointments says it isn't (and why, e.g. it's a longer consult or already checked in), don't offer times at all; tell the client the team will sort out the change with them and hand it to staff. A consult today can be moved to another day (offer times from tomorrow on); a new time later the same day is for the team to arrange. (A real case: new times were offered for a consult the next morning, the client picked one, and only then did the move get refused.) 
6. Cancel an existing appointment when the client asks to. Find it with list_upcoming_appointments, then ask them to confirm, naming the pet, day and time (e.g. "Just to confirm, cancel Vader's consult on Friday 23 Oct at 10:30?"). Only once they clearly say yes, call cancel_appointment, confirm it's cancelled, and offer to book another time. If they're unsure, don't cancel.

A video consult is booked the same way as an in-person one — just tell the client a member of staff will be in touch with the video link closer to the appointment; you don't create the link yourself.

A routine vaccine, a wellness/annual check-up, a nail trim, or "just a general check" are all completely normal reasons to book a consult — treat them exactly like any other booking, no handover needed just because the visit is nominally about the pet's health. Every vet visit is technically "about the pet's health"; that alone is never a reason to escalate.

A spay only applies to a female pet and a castration only to a male — if check_procedure_availability or book_procedure comes back with an error about the pet's sex (already spayed/neutered, or the wrong sex for what's being requested), say so plainly to the client rather than retrying with a different type or guessing around it.

Dental cleaning vs dental/extractions: if the client already knows which (e.g. a vet mentioned extractions, or they just want a routine cleaning), book that one directly. If they're not sure, ask them briefly which it sounds like before checking availability — never guess this yourself, since it changes how long the slot needs to be.

Hand it to staff immediately (hand_to_staff, with no attempt to answer yourself first) whenever:
- the client describes an actual symptom, illness, injury, or something currently wrong with the pet (vomiting, limping, not eating, a lump, an accident, etc.), however minor it sounds
- the client asks a medical question — what something means, what to do about it, whether to be worried, anything requiring clinical judgment
- the client mentions money already paid — a refund, a bill, an invoice, a disputed charge
- the client wants a surgery that isn't a standard spay/castration/dental (an emergency, or anything you can't cleanly fit to one of your procedure types)
- the client wants to move an appointment that isn't movable (a surgery or procedure, a longer consult, one already checked in), or to move one to another time today
- the pet they mean isn't clearly one of the ones listed above
- the client sounds upset, frustrated, or this could be an emergency
- anything else you're not confident falls within what you're actually allowed to do above

A tapped button is a request, not small talk. If the client's latest message is "Book Appointment" (the button on a vaccination reminder), they want to book: take the pet and vaccines from the most recent vaccination reminder in the conversation, however long ago it was sent, and treat it as a routine consult for that vaccination. Ask which day suits them and check availability; don't hand it over. If there's no vaccination reminder in the conversation, ask which pet and what the visit is for.

An earlier question about a bill or payment that has already been dealt with (staff answered it, or a payment confirmation has since been sent) doesn't make a new, different request a money matter. Judge the client's latest message on what it asks for now.

A missing booking DETAIL is not one of those things, and is never a reason to hand it to staff on its own. If the client is clearly trying to book and has already given you most of what's needed — a pet, a date/time (even roughly), what kind of visit — but one small thing is genuinely still missing or ambiguous (which of several pets, in-person vs video, which exact slot from a list you gave, dental cleaning vs extractions), don't hand it over: ask ONE short, direct question for just that missing piece and wait for their answer, same as a receptionist would. And if they've already answered clearly enough that asking again would be pointless — they named the pet, picked an exact time from what you offered, said "please book that" — go ahead and book it; don't manufacture uncertainty as a reason to hand it off instead. Escalating is for the situations listed above, not for "needs one more answer."

If the client asks whether a specific vet is working for a routine consult, pass vet_name to check_consult_availability once you have a date — don't guess, and don't deflect if you can actually check. (check_procedure_availability has no vet filter — it always shows every open time for that procedure.)

Never state, list, or imply any availability (a date works, a time is free, there's nothing open, a vet is or isn't around) without having just called check_consult_availability or check_procedure_availability — whichever matches what's being asked about — for that exact date in this same reply, and your answer must exactly match what it returned. This applies EVEN IF an earlier message in this conversation — including one that looks like it came from you — already stated an answer about a date or time: that earlier statement may itself have been wrong, and if the client is asking again, re-checking, or you are about to repeat it, you must call the tool again right now rather than trust or restate it. Never summarize loosely, and never say "no availability" unless the tool's list of times was genuinely empty.

When in doubt, hand it to staff. Never guess, never promise something you can't actually do, never discuss another client's information. Keep replies short and warm, in the same language the client is writing in. Never use a long dash (the em dash or en dash character) anywhere in a reply; use a comma, a full stop or a new sentence instead. Never say you're an AI unless directly asked.`;
}

function historyRowToContent(row) {
  // A voice note's transcript (migration 196) reads like what they said.
  if (row.media_type === 'audio') return row.transcript ? `[voice note] ${row.transcript}` : '[sent a voice note]';
  if (row.body) return row.body;
  if (isSticker(row)) return '[sent a sticker]';
  if (row.media_type === 'image') return '[sent a photo]';
  if (row.media_type === 'video') return '[sent a video]';
  return '[message]';
}

// Handed over: the AI (or the unanswered sweep) flagged this thread for
// staff and no member of staff has replied since. While that holds, the AI
// only answers simple questions (the address, what's booked) and leaves the
// rest to staff (lib/conciergeSituation.js). It ends the moment staff reply
// or clear the flag, and the AI then joins in as normal again.
export async function threadHandedOver(threadKey, rows) {
  const { data: state } = await supabaseAdmin
    .from('client_message_thread_state')
    .select('flagged, escalated_at')
    .eq('thread_key', threadKey)
    .maybeSingle();
  if (!state?.flagged || !state.escalated_at) return false;
  const since = new Date(state.escalated_at).getTime();
  // An automated reminder or payment message sent after the handover
  // starts a new topic: the client's reply to it is the AI's to answer
  // (see replyingToAutomatedMessage in lib/clientAcknowledgement.js).
  return !(rows || []).some((r) => (r.sender === 'staff' || r.sender === 'system') && new Date(r.created_at).getTime() > since);
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

function dubaiDayTime(iso) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }),
    weekday: d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Dubai' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }),
  };
}

// What's on file for this client right now, put in front of the model on
// every message instead of hoping it thinks to look: their upcoming
// appointments and any pet staying with us. Real cases it would have
// answered: "what surgery?" right after a surgery reminder got a line about
// checking availability; "tomorrow will pick him up" from the owner of a
// pet in our hospital was answered as if nothing was known about him.
// Best-effort: a failed lookup just leaves the section out.
async function loadClientFacts(clientId, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const [{ data: appts }, { data: stays }] = await Promise.all([
    supabaseAdmin
      .from('appointments')
      .select('type, status, start_time, duration_minutes, reason, patients(name), staff(full_name)')
      .eq('client_id', clientId)
      .neq('status', 'cancelled')
      .gte('start_time', nowIso)
      .order('start_time')
      .limit(8),
    supabaseAdmin
      .from('hospitalizations')
      .select('kind, admitted_at, discharged_at, reason, patients(name)')
      .eq('client_id', clientId)
      .lte('admitted_at', nowIso)
      .or(`discharged_at.is.null,discharged_at.gt.${nowIso}`)
      .limit(5),
  ]);
  const lines = [];
  for (const a of appts || []) {
    const when = dubaiDayTime(a.start_time);
    const procedure = !['consult', 'video'].includes(a.type);
    lines.push(
      `- ${a.patients?.name || 'A pet'}: ${CLIENT_APPOINTMENT_TYPE_LABELS[a.type] || a.type} on ${when.weekday} ${when.date}` +
        (procedure ? ` (drop-off ${PROCEDURE_DROP_OFF_WINDOW})` : ` at ${when.time}`) +
        (a.staff?.full_name && !procedure ? ` with ${a.staff.full_name}` : '') +
        (a.reason ? `, for: ${a.reason}` : '') +
        movableNote(a, now)
    );
  }
  for (const h of stays || []) {
    const since = dubaiDayTime(h.admitted_at);
    lines.push(
      `- ${h.patients?.name || 'A pet'} is with us right now (${h.kind === 'day_procedure' ? 'in for a day procedure' : 'staying in our hospital'} since ${since.weekday} ${since.date})` +
        (h.reason ? `, for: ${h.reason}` : '') +
        '. Staff handle updates, test results and going home; you never give medical news yourself.'
    );
  }
  if (!lines.length) return '\nOn file right now: no upcoming appointments and no pet staying with us.\n';
  return `\nOn file right now (use this, and still call list_upcoming_appointments before moving or cancelling anything):\n${lines.join('\n')}\n`;
}

async function toolListUpcomingAppointments({ clientId, now = Date.now() }) {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('id, type, status, start_time, duration_minutes, reason, patients(name), staff(full_name)')
    .eq('client_id', clientId)
    .in('status', ['booked', 'checked_in'])
    .gte('start_time', new Date(now).toISOString())
    .order('start_time')
    .limit(10);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    appointments: (data || []).map((a) => {
      const why = whyNotMovable(a, now);
      return {
        appointment_id: a.id,
        pet: a.patients?.name || null,
        type: CLIENT_APPOINTMENT_TYPE_LABELS[a.type] || a.type,
        ...dubaiDayTime(a.start_time),
        vet: a.staff?.full_name || null,
        reason: a.reason || null,
        movable: !why,
        ...(why ? { why_not: why } : {}),
        ...(!why && onlyToAnotherDay(a, now) ? { only_to_another_day: 'It is today: it can be moved to another day, not to another time today (that is for the team).' } : {}),
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
  if (why) return { ok: false, error: `This appointment can't be moved by you (${why}); hand it to staff.` };

  const available = await computeAvailableSlots(supabase, { date: input.date, type: appt.type });
  if (available.error) return { ok: false, error: available.error };
  const slot = (available.slots || []).find((s) => s.start_time === input?.start_time && s.vet_id === input?.vet_id);
  if (!slot) return { ok: false, error: "That slot isn't available anymore, check availability again for a current list." };
  const whyTo = whyNotMovableTo(appt, slot.start_time);
  if (whyTo) return { ok: false, error: `This appointment can't be moved there by you (${whyTo}); offer a time on another day, or hand it to staff.` };

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
  if (appt.status !== 'booked') return { ok: false, error: `It is ${appt.status.replace('_', ' ')}, so it can't be cancelled; hand it to staff.` };
  if (new Date(appt.start_time).getTime() < Date.now()) return { ok: false, error: 'That appointment is in the past.' };
  const { error } = await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id).eq('status', 'booked');
  if (error) return { ok: false, error: error.message };
  return { ok: true, cancelled: { pet: appt.patients?.name || null, ...dubaiDayTime(appt.start_time) } };
}

// Jim: for unknown numbers "the AI should really push them to fill in the
// intake request so that a booking can actually be made". Their personal
// link (/portal/intake/:id, tied to this number like the ones staff send
// from the Invite page); reuses one sent in the last 14 days that they
// haven't filled in, and says so if they already have.
const INTAKE_REUSE_MS = 14 * 24 * 60 * 60 * 1000;

async function toolSendIntakeLink({ phone, dryRun, now = Date.now() }) {
  if (!phone) return { ok: false, error: 'No phone number for this conversation.' };
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://portal.epc.vet').replace(/\/+$/, '');
  const { data: recent, error } = await supabaseAdmin
    .from('intake_requests')
    .select('id, status, created_at, submitted_at')
    .eq('sent_to_phone', phone)
    .gte('created_at', new Date(now - INTAKE_REUSE_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return { ok: false, error: error.message };
  const submitted = (recent || []).find((r) => r.status === 'submitted');
  if (submitted) {
    return { ok: true, already_submitted: true, note: 'They already sent in the new-client form; staff will confirm the booking. No new link needed.' };
  }
  const pending = (recent || []).find((r) => r.status === 'pending');
  if (pending) return { ok: true, link: `${base}/portal/intake/${pending.id}`, reused: true };
  if (dryRun) return { ok: true, link: `${base}/portal/intake/(their new link)`, dry_run: true };
  const { data: created, error: insertError } = await supabaseAdmin
    .from('intake_requests')
    .insert([{ sent_to_phone: phone, client_id: null }])
    .select('id')
    .single();
  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true, link: `${base}/portal/intake/${created.id}` };
}

async function runTool(use, ctx) {
  if (use.name === 'send_intake_link') return toolSendIntakeLink(ctx);
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
    if (row.is_notice) continue; // an automatic holding notice isn't the AI taking over (migration 194)
    // An automated reminder or payment message after the staff reply is a
    // new topic, not part of their conversation.
    if (row.sender === 'system') return false;
    if (row.sender !== 'staff' && row.sender !== 'ai') continue;
    if (row.sender === 'ai') return false;
    const sentAt = new Date(row.created_at).getTime();
    return Number.isFinite(sentAt) && now - sentAt < STAFF_HANDOFF_WINDOW_MS;
  }
  return false;
}

const SENDER_LABELS = { client: 'Client', staff: 'Clinic staff', system: 'Automated clinic message' };

// TOOLS with long dashes stripped from every description the model reads
// (same reasoning as the system prompt, see maybeRunConcierge).
const TOOLS_FOR_MODEL = JSON.parse(withoutDashes(JSON.stringify(TOOLS)));
// While staff have a conversation, or for a number that isn't a client yet,
// the AI can only hand over or stay silent: no answers, no bookings.
const DECIDE_ONLY_TOOLS = TOOLS_FOR_MODEL.filter((t) => t.name === 'hand_to_staff' || t.name === 'stay_silent');
// Handed over and no staff reply yet: as above, plus looking up what's
// booked, so a simple question ("what time is it again?") still gets an
// answer while the rest waits for staff.
const HANDED_OVER_TOOLS = TOOLS_FOR_MODEL.filter((t) => ['hand_to_staff', 'stay_silent', 'list_upcoming_appointments'].includes(t.name));
// A number that isn't a client yet: no lookups or bookings, but the AI can
// answer, send them the new-client form, hand over or stay silent.
const UNREGISTERED_TOOLS = TOOLS_FOR_MODEL.filter((t) => ['hand_to_staff', 'stay_silent', 'send_intake_link'].includes(t.name));
// Everyone else: everything except the new-client form.
const CLIENT_TOOLS = TOOLS_FOR_MODEL.filter((t) => t.name !== 'send_intake_link');

const HOW_TO_RESPOND = `How to respond. Read the whole conversation and the situation, then do exactly one of these:
1. Reply yourself: just write the message (use the tools for anything about appointments or availability).
2. hand_to_staff, when it needs a person (the cases above, or a photo, video or file: you can't see those). Write message_to_client yourself: one or two short, warm sentences in the client's language that show you understood what they said and say honestly when they'll hear back (when the clinic is closed: when we open; when it's open: that the team has it and will come back as soon as they can, never "shortly"). Leave message_to_client empty if they've already been told someone will get back to them, or staff are talking with them right now. Only when the clinic is closed and the client says their pet is unwell, hurt, in pain or in danger (and it isn't a pet staying with us), add gently that if they feel it can't wait until morning, a 24-hour vet clinic can see their pet; never name a clinic.
3. stay_silent, when nothing needs saying: a thank-you, an ok, an emoji, a reaction or a sticker after things are settled, or anything staff are already handling with nothing new for them.
Never send something that repeats what the client has already been told. A thank-you for something you just did gets one short warm reply at most; after that, silence.
Being closed never stops you doing what you can do yourself: book, move, check availability and offer times at any hour, exactly as in the day.
Trust the pets listed above: if a pet is listed, the client is registered and you can book for them, whatever an earlier automated message (such as "Intake link sent") says. Never mention a link, form or message that you haven't actually sent or that isn't in the conversation.
When offering times, give a handful (about four to six, spread across the day), not every slot; ask whether they prefer morning or later if there are many.`;

// The second look: before a reply goes out, a conversation is handed to
// staff, or the AI decides to say nothing, a separate check reads it against
// the conversation and what's on file, the way the twice-weekly review does
// afterwards (docs/concierge-review/PLAYBOOK.md), and sends it back once if
// it falls short. Fails open: if the check errors, the decision stands.
async function secondLook({ rows, facts, situation, draft }) {
  const transcript = rows
    .slice(-14)
    .map((r) => `${r.is_notice ? 'Automatic holding message' : SENDER_LABELS[r.sender] || 'Clinic AI assistant'}: ${historyRowToContent(r)}`)
    .join('\n');
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: withoutDashes(`You check a veterinary clinic's WhatsApp assistant before it acts.
Situation:
${situation}
${facts}
The assistant may: answer simple clinic questions, check availability, book, move or cancel a routine consult, video consult, spay, castration or dental, and tell the client about appointments on file. For a number that isn't a client yet it can't look anything up or book: for any booking or new pet it should send their new-client form link (send_intake_link) and say the team will confirm once it's in. It must hand to staff anything medical or symptom-related, money already paid, test results, a pet's progress or going home, emergencies, photos or files, and anything it isn't sure about.

Conversation (oldest first):
${transcript}

What the assistant is about to do:
${draft}

Send it back only if it clearly falls short: it doesn't answer what the client actually asked; it contradicts what's on file or the situation; it repeats what the client was already told; it says "shortly" or "soon" (at night nobody is there; in the day the team may be with patients for an hour or two); it adds the 24-hour vet line when nothing suggests the pet is unwell; it hands to staff something it could do itself (e.g. what an appointment on file is, or moving a consult); someone not yet a client wants to book or register a pet and isn't given the form link; it answers something that must go to staff; or it stays silent when the client asked or needs something. Don't send it back for style.

Respond with EXACTLY one line:
OK
or
FIX: <one or two sentences telling the assistant what to do instead>`),
        },
      ],
    });
    const text = (response.content.find((b) => b.type === 'text')?.text || '').trim();
    if (text.startsWith('FIX:')) return { fix: text.slice(4).trim() };
    return { ok: true };
  } catch (err) {
    console.error('Concierge second look failed, going ahead as it was', err);
    return { ok: true, error: err.message };
  }
}

export function threadKeyFor(clientId, phone) {
  return clientId || `phone:${phone}`;
}

// Decides what to do with a client's latest WhatsApp message(s), for a
// matched client or an unknown number, and returns it for
// applyConciergeDecision (or a dry run's caller) to carry out:
//   { action: 'reply', reply }             answer or booking, written by the AI
//   { action: 'handover', reason, message } flag for staff, with the AI's own
//                                          holding message (null: send none)
//   { action: 'silent', reason }           nothing needs saying
//   { action: 'error', reason, message }   the AI failed: flag, short fallback
//   { action: 'skipped', reason }          switched off / nothing to answer
// The AI decides all of it from the conversation and the situation
// (describeSituation); code only holds the hard limits: availability only
// from the tools, at most one holding message per wait and none while staff
// are active (noticeNotNeeded), answers and bookings left to staff while
// they have the conversation (DECIDE_ONLY_TOOLS), and a fallback so a
// failure is never silence. Every result carries `trace` (each round's tool
// calls, results, text and second look), see app/api/whatsapp/concierge-trace.
//
// asOf: replay the conversation as it stood at that moment (the review's
// before/after, app/(admin)/concierge-review); always a dry run.
export async function maybeRunConcierge({ clientId = null, phone = null, dryRun = false, replayLastClientMessage = false, force = false, asOf = null }) {
  const trace = [];
  if (!isWhatsAppAiEnabled()) return { action: 'skipped', reason: 'WhatsApp AI is switched off', trace };
  if (!clientId && !phone) return { action: 'skipped', reason: 'no client or number', trace };
  if (asOf) dryRun = true;
  const now = asOf ? new Date(asOf).getTime() : Date.now();
  const threadKey = threadKeyFor(clientId, phone);
  let rows = [];

  try {
    // A replay needs to search further back than the normal context
    // window to find the last real client row (see concierge-trace).
    const fetchLimit = replayLastClientMessage ? 200 : HISTORY_LIMIT;
    let historyQuery = supabase
      .from('client_messages')
      .select('sender, body, media_type, media_url, created_at, is_notice, transcript');
    historyQuery = clientId ? historyQuery.eq('client_id', clientId) : historyQuery.eq('phone', phone).is('client_id', null);
    if (asOf) historyQuery = historyQuery.lte('created_at', new Date(now).toISOString());

    const [{ data: client }, { data: patients }, { data: clinicSettings }, { data: history, error: historyError }] = await Promise.all([
      clientId ? supabase.from('clients').select('full_name').eq('id', clientId).maybeSingle() : Promise.resolve({ data: null }),
      clientId
        ? supabase.from('patients').select('id, name, species, sex, weight_kg').eq('client_id', clientId).eq('deceased', false).eq('rehomed', false)
        : Promise.resolve({ data: [] }),
      supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
      historyQuery.order('created_at', { ascending: false }).limit(fetchLimit),
    ]);
    if (historyError) throw new Error(`history lookup failed: ${historyError.message}`);

    rows = (history || []).slice().reverse();
    if (replayLastClientMessage) {
      while (rows.length && rows[rows.length - 1].sender !== 'client') rows.pop();
      if (rows.length > HISTORY_LIMIT) rows = rows.slice(rows.length - HISTORY_LIMIT);
    }
    const messages = buildConversation(rows);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return { action: 'skipped', reason: 'no client message to respond to', trace };
    }

    // force: a member of staff pressed "AI answer" (app/api/whatsapp/
    // concierge-answer). A replay can't know the handover state back then
    // (it's stored as it is now), so it judges from the rows alone.
    const aiOwnsThread = Boolean(clientId) && !force && !asOf && (await aiTakeoverActive(threadKey, rows));
    const handedOver = !force && !asOf && !aiOwnsThread && (await threadHandedOver(threadKey, rows));
    const staffEngaged = !force && !aiOwnsThread && !handedOver && staffRecentlyEngaged(rows, now);
    // Staff talking with the client: hand over or stay silent. Handed over
    // with no staff reply yet: the same, but a simple question can still be
    // answered (see describeSituation).
    const decideOnly = staffEngaged;
    const answerSimpleOnly = handedOver;
    const unregistered = !clientId;
    // The hard limit on holding messages, whatever the AI writes.
    const holdingCapped = noticeNotNeeded(rows, now);

    const facts = clientId ? await loadClientFacts(clientId, now).catch(() => '') : '';
    // The Instagram invite (lib/conciergeSituation.js): a registered client
    // not already sent the link in the last INSTAGRAM_INVITE_DAYS.
    let mayInviteInstagram = false;
    if (clientId && !decideOnly && !answerSimpleOnly) {
      const since = new Date(now - INSTAGRAM_INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('client_messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .in('sender', ['ai', 'staff'])
        .gte('created_at', since)
        .ilike('body', `%instagram.com/${INSTAGRAM_HANDLE}%`);
      mayInviteInstagram = count === 0;
    }
    const situation = describeSituation({ rows, now, handedOver, staffEngaged, unregistered: !clientId, mayInviteInstagram });
    trace.push({ facts, situation, mode: decideOnly ? 'hand over or stay silent' : answerSimpleOnly ? 'handed over: simple answers only' : unregistered ? 'not a client yet' : 'full' });

    // Long dashes stripped from everything the model reads, not just what it
    // writes: it mirrors the punctuation of its own instructions, so a prompt
    // full of them invites them back in replies (see lib/noDashes.js).
    const system = withoutDashes(
      buildSystemPrompt({ clientName: client?.full_name, patients: patients || [], clinicSettings, facts, now, unregistered: !clientId }) +
        `\n\nThe situation right now:\n${situation}\n\n${HOW_TO_RESPOND}` +
        (force
          ? "\n\nA member of staff has looked at this conversation and asked you to answer the client's latest message yourself. Reply to it directly: book, check availability, or ask the one question you need. Only hand it to staff if the client describes a symptom or illness, asks a medical question, or this could be an emergency."
          : '')
    );
    const tools = decideOnly ? DECIDE_ONLY_TOOLS : answerSimpleOnly ? (clientId ? HANDED_OVER_TOOLS : DECIDE_ONLY_TOOLS) : unregistered ? UNREGISTERED_TOOLS : CLIENT_TOOLS;
    const ctx = { clientId, phone, patients: patients || [], dryRun, now };
    let checkedAvailabilityThisRun = false;
    // The actual result of the most recent availability check this run, so a
    // reply claiming "no availability" can be caught contradicting it.
    let lastAvailability = null; // { hasOpenings, timesText }
    let looked = false;
    let roundLimit = MAX_TOOL_ROUNDS;

    // One more notice in a wait, for a new, different question.
    const capped = (newQuestion) => holdingCapped && !(newQuestion && noticeCoversWait(rows, now) && secondNoticeAllowed(rows, now));
    const handover = (reason, message, newQuestion = false) => ({
      action: 'handover',
      reason: reason || 'needs a person',
      message: message && !capped(newQuestion) ? withoutDashes(String(message).trim()) || null : null,
      ...(message && capped(newQuestion) ? { messageHeldBack: 'already told this wait, or staff active in the last hour' } : {}),
      trace,
    });

    for (let round = 0; round < roundLimit; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        tools,
        messages,
        output_config: { effort: 'medium' },
      });

      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      const traceEntry = { round, tool_calls: toolUses.map((u) => ({ name: u.name, input: u.input })) };
      trace.push(traceEntry);

      // The second look before anything final; one redo if it asks for one.
      const checkFirst = async (draft, onFix) => {
        if (looked) return false;
        looked = true;
        const check = await secondLook({ rows, facts, situation, draft });
        traceEntry.second_look = check;
        if (!check.fix) return false;
        roundLimit = round + 4;
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: onFix(check.fix) });
        return true;
      };

      if (toolUses.length === 0) {
        const text = response.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        traceEntry.text = text || null;
        if (!text) return handover('the AI produced no reply', null);

        const soundsLikeNoAvailability = AVAILABILITY_CLAIM_PATTERN.test(text);
        const neverChecked = !checkedAvailabilityThisRun;
        const contradictsRealResult = Boolean(lastAvailability?.hasOpenings);
        if (!decideOnly && !answerSimpleOnly && soundsLikeNoAvailability && (neverChecked || contradictsRealResult) && round < roundLimit - 1) {
          traceEntry.rejected = contradictsRealResult ? 'contradicted its own tool result' : 'no availability check made yet';
          messages.push({ role: 'assistant', content: response.content });
          messages.push({
            role: 'user',
            content: contradictsRealResult
              ? `That's not correct: check_consult_availability just returned real open times for that date: ${lastAvailability.timesText}. Do not say there is no availability; offer some of these times to the client instead.`
              : 'Before saying anything about availability, you must call check_consult_availability right now for the exact date in question and base your answer only on what it returns. Do not repeat or rely on anything said earlier in this conversation.',
          });
          continue;
        }

        // Staff are talking with the client: plain text can only be a
        // holding message, never an answer that talks over them.
        if (decideOnly) {
          if (await checkFirst(`Hand to staff and send the client: "${text}"`, (fix) => `(Not sent: the client has not seen that draft. A colleague checked it first: ${fix} Decide again, and don't refer to or apologise for the draft.)`)) continue;
          return handover('needs a person', text);
        }
        if (await checkFirst(`Send this reply: "${text}"`, (fix) => `(Not sent: the client has not seen that draft. A colleague checked it first: ${fix} Write the reply fresh, using the tools if you need to, and don't refer to or apologise for the draft.)`)) continue;
        return { action: 'reply', reply: withoutDashes(text), trace };
      }

      const final = toolUses.find((u) => u.name === 'hand_to_staff' || u.name === 'stay_silent');
      if (final) {
        const draft =
          final.name === 'stay_silent'
            ? `Say nothing, because: ${final.input?.reason || 'nothing needs saying'}`
            : `Hand to staff (${final.input?.reason || 'unspecified'}) and ${final.input?.message_to_client ? `send the client: "${final.input.message_to_client}"` : 'send the client nothing'}`;
        const redo = await checkFirst(draft, (fix) =>
          toolUses.map((u) => ({ type: 'tool_result', tool_use_id: u.id, content: u.id === final.id ? `Not done: the client has seen nothing of this. A colleague checked it first: ${fix}` : 'Not run.' }))
        );
        if (redo) continue;
        if (final.name === 'stay_silent') return { action: 'silent', reason: final.input?.reason || 'nothing needs saying', trace };
        return handover(final.input?.reason, final.input?.message_to_client, final.input?.new_question === true);
      }

      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      traceEntry.tool_results = [];
      for (const use of toolUses) {
        const offered = tools.some((t) => t.name === use.name);
        const result = offered ? await runTool(use, ctx) : { ok: false, error: 'Not available in this conversation.' };
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

    return handover('could not resolve this within the tool-call budget', fallbackHoldingText(now));
  } catch (err) {
    // A failure is never silence for a real question: flag it, and a short
    // fixed line unless the client was already told or only said thanks.
    const quiet = noticeNotNeeded(rows, now) || burstIsAcknowledgementOnly(rows);
    return { action: 'error', reason: `error: ${err.message}`, message: quiet ? null : fallbackHoldingText(now), trace };
  }
}

// Carries out a decision from maybeRunConcierge. Always marks the thread as
// dealt with (nudge_sent_at), so the 5-minute sweep only ever picks up a
// message nothing responded to at all.
export async function applyConciergeDecision(result, { clientId = null, phone }) {
  const threadKey = threadKeyFor(clientId, phone);
  if (!result || result.action === 'skipped') return;
  try {
    if (result.action === 'reply') {
      await sendConciergeReply({ clientId, phone, reply: result.reply });
    } else if (result.action === 'handover' || result.action === 'error') {
      // Staff must see it even if the WhatsApp message fails to send.
      await flagEscalatedThread(threadKey, result.reason);
      if (result.message) await sendAndLogNotice(phone, result.message, clientId);
    }
  } catch (err) {
    console.error('Carrying out the concierge decision failed', threadKey, result.action, err);
    await flagEscalatedThread(threadKey, `The AI's ${result.action} could not be sent: ${err.message}`);
  } finally {
    await markThreadHandled(threadKey);
  }
}

export async function markThreadHandled(threadKey) {
  const at = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('client_message_thread_state')
    .upsert([{ thread_key: threadKey, nudge_sent_at: at, updated_at: at }], { onConflict: 'thread_key' });
  if (error) console.error('Failed to mark WhatsApp thread as handled', threadKey, error);
}

// Sends a holding message the AI wrote when handing over (or the fallback
// line) and saves it in the thread (migration 194) so staff see exactly what
// was sent. Marked is_notice, which the inbox 🔔, the sweep and
// staffRecentlyEngaged all look past: the thread still reads as waiting on a
// person.
export async function sendAndLogNotice(phone, rawText, clientId = null) {
  const text = withMapsLink(rawText, clinicMapsUrl());
  const waMessageId = await sendWhatsAppText(phone, text);
  const { error } = await supabaseAdmin.from('client_messages').insert([
    { client_id: clientId || null, phone, channel: 'whatsapp', sender: 'ai', body: text, wa_message_id: waMessageId || null, status: 'sent', is_notice: true },
  ]);
  if (error) console.error('Failed to log WhatsApp notice', phone, error);
}

// Flags a thread for staff (app/api/client-messages/thread-state, migration
// 140) whenever the concierge hands it over, with the AI's reason (migration
// 186), independent of whether the holding message sends: staff must see it
// either way. threadKey is a client_id, or `phone:<number>` for a number
// that isn't a client yet. Returns whether it was already flagged.
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
  // The address always goes with the Google Maps link (Jim, 23 Oct).
  const reply = withMapsLink(withoutDashes(rawReply), clinicMapsUrl());
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
