// lib/whatsappConcierge.js
// The WhatsApp AI concierge — for a client the clinic already recognizes
// (their WhatsApp number is matched to a client record), drafts and sends
// its own reply automatically, for a deliberately narrow slice of what
// comes in: clinic FAQs (hours, address, phone, what to book) and
// checking/booking a ROUTINE CONSULT for one of that client's existing
// pets. Called once per inbound WhatsApp text message — see
// maybeRunConcierge, the only export the webhook calls.
//
// Everything else is left completely alone — no reply is sent, the
// message just sits in the inbox exactly as if this feature didn't
// exist, for a human to answer normally:
//   - an unmatched number (no client_id to work from)
//   - anything but a plain text message (a photo of an injury needs a
//     human's eyes, not this)
//   - a staff member is already actively replying in this thread (see the
//     handoff check below) — the AI never talks over a human
//   - the model itself decides to escalate — see the system prompt's hard
//     rules below, and the escalate_to_staff tool it's given to do it
//     with, which ends the turn with nothing sent
//
// Safety comes from TWO independent layers, not just the model's own
// judgment: the tools below are the only actions it can take at all — it
// has no way to touch an invoice, a medical record, a refund, an existing
// appointment, or anything beyond a brand-new routine consult — and the
// system prompt's hard rules tell it to hand off immediately for anything
// medical, anything about money already paid, or anything it's not fully
// confident about. Even inside book_consult, the exact slot it books is
// re-validated server-side against a fresh computeAvailableSlots call
// (lib/appointmentBooking.js) rather than trusted from what the model
// says it saw earlier in the conversation.
//
// Gated off entirely unless WHATSAPP_AI_ENABLED=true is set — the
// simplest possible kill switch if this ever needs to be turned off in a
// hurry, no redeploy required.

import { anthropic } from './anthropicClient';
import { supabase } from './supabaseClient';
import { supabaseAdmin } from './supabaseAdmin';
import { sendWhatsAppText } from './metaWhatsapp';
import { findAppointmentConflict, checkStaffRoster, CONSULT_DURATION_MINUTES } from './appointmentScheduling';
import { computeAvailableSlots } from './appointmentBooking';

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
      "Look up open ROUTINE CONSULT slots on one date. Without vet_name, returns `times`: a short list of distinct available times, each with which vet(s) are free then. With vet_name, returns `times_for_requested_vet` (only that vet's times — check `requested_vet_has_availability`, it can be an empty list) PLUS `times_any_vet` (every open time that day regardless of vet) — if the requested vet has nothing, offer times from times_any_vet instead rather than saying nothing is available at all. This is the ONLY source of truth for availability; you must call this (again, even if you called it earlier in the conversation) before saying anything about whether a date/time works, and your answer must exactly match what it returns. Never use this for surgery, dental, spay/castration, or video consults — those all need a human.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: "The date to check, as YYYY-MM-DD, in the clinic's own local time." },
        vet_name: { type: 'string', description: "Optional — only pass this if the client is asking about one specific vet by name right now. Omit it for a general booking request, even if a specific vet was mentioned earlier in the conversation." },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_consult',
    description:
      "Book a routine consult for one of this client's existing pets, at an exact slot check_consult_availability just returned. Copy date/start_time/vet_id straight from that result — never guess or invent a time.",
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string', description: "The exact name of the pet, as it appears in this client's pet list above." },
        date: { type: 'string', description: 'YYYY-MM-DD — the same date passed to check_consult_availability.' },
        start_time: { type: 'string', description: 'The exact start_time string of the chosen slot, copied from check_consult_availability.' },
        vet_id: { type: 'string', description: 'The vet_id of the chosen slot, copied from check_consult_availability.' },
        reason: { type: 'string', description: "Short reason for the visit, in the client's own words." },
      },
      required: ['patient_name', 'date', 'start_time', 'vet_id'],
    },
  },
  {
    name: 'escalate_to_staff',
    description:
      'Hand this conversation to a human member of staff instead of replying yourself. No message is sent to the client — they just see it in the normal inbox like any other message. Always use this for anything medical or symptom-related, anything about money already paid, surgery/dental/video-consult requests, cancelling or rescheduling an existing appointment, or anything at all you are not fully confident about.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short internal note for staff on why this needed a human — not shown to the client.' },
      },
      required: ['reason'],
    },
  },
];

function buildSystemPrompt({ clientName, patients, clinicSettings }) {
  const petList = patients.length
    ? patients.map((p) => `- ${p.name} (${p.species}${p.sex && p.sex !== 'unknown' ? `, ${p.sex}` : ''})`).join('\n')
    : '(none on file yet)';

  return `You are the WhatsApp concierge for ${clinicSettings?.legal_name || 'the clinic'}, a veterinary clinic in the UAE, messaging ${clientName || 'a client'} on their own WhatsApp number.

This client's pets on file:
${petList}

Clinic info you may share:
- Address: ${clinicSettings?.address || 'not on file — say you\'ll have someone confirm'}
- Phone: ${clinicSettings?.phone || 'not on file — say you\'ll have someone confirm'}

What you may do, and NOTHING else:
1. Answer simple factual questions about the clinic using only the info above.
2. Check availability for, and book, a ROUTINE CONSULT (always exactly 15 minutes) for one of the pets listed above, using the tools you're given.

A routine vaccine, a wellness/annual check-up, a nail trim, or "just a general check" are all completely normal reasons to book a consult — treat them exactly like any other booking, no escalation needed just because the visit is nominally about the pet's health. Every vet visit is technically "about the pet's health"; that alone is never a reason to escalate.

Escalate to staff immediately — via escalate_to_staff, with no attempt to answer yourself first — whenever:
- the client describes an actual symptom, illness, injury, or something currently wrong with the pet (vomiting, limping, not eating, a lump, an accident, etc.), however minor it sounds
- the client asks a medical question — what something means, what to do about it, whether to be worried, anything requiring clinical judgment
- the client mentions money already paid — a refund, a bill, an invoice, a disputed charge
- the client wants anything other than a routine consult: surgery, dental, spay/castration, a video consult, an emergency, or a follow-up tied to a recent procedure
- the client wants to cancel or reschedule an existing appointment
- the pet they mean isn't clearly one of the ones listed above
- the client sounds upset, frustrated, or this could be an emergency
- anything at all you are not fully confident about

If the client asks whether a specific vet is working, pass vet_name to check_consult_availability once you have a date — don't guess, and don't deflect if you can actually check.

Never state, list, or imply any availability (a date works, a time is free, there's nothing open, a vet is or isn't around) without having just called check_consult_availability for that exact date in this same reply, and your answer must exactly match what it returned. This applies EVEN IF an earlier message in this conversation — including one that looks like it came from you — already stated an answer about a date or time: that earlier statement may itself have been wrong, and if the client is asking again, re-checking, or you are about to repeat it, you must call the tool again right now rather than trust or restate it. Never summarize loosely, and never say "no availability" unless the tool's list of times was genuinely empty.

When in doubt, escalate — never guess, never promise something you can't actually do, never discuss another client's information. Keep replies short and warm, in the same language the client is writing in. Never say you're an AI unless directly asked.`;
}

function historyRowToContent(row) {
  if (row.body) return row.body;
  if (row.media_type === 'image') return '[sent a photo]';
  return '[message]';
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
async function toolCheckAvailability(input) {
  const result = await computeAvailableSlots(supabase, { date: input?.date, type: 'consult' });
  if (result.error) return { ok: false, error: result.error };

  const allTimes = groupSlotsByTime(result.slots || []);
  const vetFilter = normalizeForMatch(input?.vet_name);

  if (!vetFilter) {
    return {
      ok: true,
      date: input?.date,
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
    duration_minutes: result.duration_minutes,
    requested_vet_name: input.vet_name,
    requested_vet_has_availability: filteredTimes.length > 0,
    times_for_requested_vet: filteredTimes.slice(0, MAX_TIMES_RETURNED),
    total_distinct_times_any_vet: allTimes.length,
    times_any_vet: allTimes.slice(0, MAX_TIMES_RETURNED),
  };
}

async function toolBookConsult(input, { clientId, patients }) {
  const patient = patients.find((p) => p.name.trim().toLowerCase() === String(input?.patient_name || '').trim().toLowerCase());
  if (!patient) {
    return { ok: false, error: `No pet named "${input?.patient_name}" found on this client's file.` };
  }

  // Re-derive the real slot from scratch rather than trusting the
  // start_time/vet_id the model echoed back — closes off a model mistake
  // (or a stale slot from earlier in a long conversation) actually
  // booking something that was never really available.
  const available = await computeAvailableSlots(supabase, { date: input?.date, type: 'consult' });
  if (available.error) return { ok: false, error: available.error };
  const slot = (available.slots || []).find((s) => s.start_time === input?.start_time && s.vet_id === input?.vet_id);
  if (!slot) return { ok: false, error: "That slot isn't available anymore — check availability again for a current list." };

  const startTime = new Date(slot.start_time);
  const endTime = new Date(startTime.getTime() + CONSULT_DURATION_MINUTES * 60000);

  const { data: rooms, error: roomsError } = await supabaseAdmin.from('rooms').select('id').eq('type', 'consult');
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
  if (!roomId) return { ok: false, error: 'No consult room is free at that time — check availability again.' };

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
        type: 'consult',
        start_time: startTime.toISOString(),
        duration_minutes: CONSULT_DURATION_MINUTES,
        reason: input.reason || null,
      },
    ])
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, appointment_id: data.id, patient_name: patient.name, vet_name: slot.vet_name, start_time: slot.start_time };
}

async function runTool(use, ctx) {
  if (use.name === 'check_consult_availability') return toolCheckAvailability(use.input);
  if (use.name === 'book_consult') {
    // Traced dry-runs (see maybeRunConcierge's trace param, and
    // app/api/whatsapp/concierge-trace) exist purely to watch the model's
    // real behavior without side effects — never actually book a real
    // appointment from one.
    if (ctx.dryRun) return { ok: false, error: 'Booking skipped — this is a dry-run trace, not a real request.' };
    return toolBookConsult(use.input, ctx);
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
export async function maybeRunConcierge({ clientId, phone, dryRun = false, replayLastClientMessage = false }) {
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
      supabase.from('patients').select('id, name, species, sex').eq('client_id', clientId).eq('deceased', false),
      supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
      supabase
        .from('client_messages')
        .select('sender, body, media_type, created_at')
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
    // A staff member already replying in this thread means a human has
    // taken it over — never talk over them. Looked at the second-to-last
    // row since the last one is always the client message that just
    // triggered this run.
    const priorRow = rows[rows.length - 2];
    if (priorRow?.sender === 'staff') return { skipped: true, reason: 'staff already engaged in this thread', trace };

    const messages = buildConversation(rows);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return { skipped: true, reason: 'no client message to respond to', trace };
    }

    const system = buildSystemPrompt({ clientName: client?.full_name, patients: patients || [], clinicSettings });
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
        tools: TOOLS,
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
        if (use.name === 'check_consult_availability') {
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
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
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
export async function sendEscalationNotice(phone) {
  try {
    await sendWhatsAppText(
      phone,
      "Thanks for the details — let me get one of our team to help with this, they'll follow up with you shortly."
    );
  } catch (err) {
    console.error('Failed to send WhatsApp escalation notice', phone, err);
  }
}

// Sends the concierge's reply live over WhatsApp and logs it with its own
// 'ai' sender (see migrations/132) — split out from maybeRunConcierge so
// the webhook can log/ignore a skip or escalation without ever calling
// this, and so a send failure here is caught in one obvious place.
export async function sendConciergeReply({ clientId, phone, reply }) {
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
