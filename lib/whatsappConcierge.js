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
      "Look up open ROUTINE CONSULT slots on one date. Never use this for surgery, dental, spay/castration, or video consults — those all need a human.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: "The date to check, as YYYY-MM-DD, in the clinic's own local time." },
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

Escalate to staff immediately — via escalate_to_staff, with no attempt to answer yourself first — whenever:
- the client mentions any symptom, illness, injury, medication, or anything about their pet's health, however minor it sounds
- the client mentions money already paid — a refund, a bill, an invoice, a disputed charge
- the client wants anything other than a routine consult: surgery, dental, spay/castration, a video consult, an emergency, or a follow-up tied to a recent procedure
- the client wants to cancel or reschedule an existing appointment
- the pet they mean isn't clearly one of the ones listed above
- the client sounds upset, frustrated, or this could be an emergency
- anything at all you are not fully confident about

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

async function toolCheckAvailability(input) {
  const result = await computeAvailableSlots(supabase, { date: input?.date, type: 'consult' });
  if (result.error) return { ok: false, error: result.error };
  return {
    ok: true,
    duration_minutes: result.duration_minutes,
    slots: (result.slots || []).map((s) => ({ date: input.date, start_time: s.start_time, vet_id: s.vet_id, vet_name: s.vet_name })),
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
  if (use.name === 'book_consult') return toolBookConsult(use.input, ctx);
  return { ok: false, error: 'unknown tool' };
}

// Runs the concierge for one freshly-inserted inbound WhatsApp message and
// returns what happened — { skipped, sent, escalated } with a `reason` on
// the latter two — for the webhook to log. Never throws: any internal
// failure comes back as { skipped: true, reason: 'error: ...' } so a bug
// here can never take the webhook itself down.
export async function maybeRunConcierge({ clientId, phone }) {
  if (!isWhatsAppAiEnabled() || !clientId) return { skipped: true, reason: 'not eligible' };

  try {
    const [{ data: client }, { data: patients }, { data: clinicSettings }, { data: history, error: historyError }] = await Promise.all([
      supabase.from('clients').select('full_name').eq('id', clientId).maybeSingle(),
      supabase.from('patients').select('id, name, species, sex').eq('client_id', clientId).eq('deceased', false),
      supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
      supabase
        .from('client_messages')
        .select('sender, body, media_type, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
    ]);

    if (historyError) return { skipped: true, reason: `history lookup failed: ${historyError.message}` };

    const rows = (history || []).slice().reverse();
    // A staff member already replying in this thread means a human has
    // taken it over — never talk over them. Looked at the second-to-last
    // row since the last one is always the client message that just
    // triggered this run.
    const priorRow = rows[rows.length - 2];
    if (priorRow?.sender === 'staff') return { skipped: true, reason: 'staff already engaged in this thread' };

    const messages = buildConversation(rows);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return { skipped: true, reason: 'no client message to respond to' };
    }

    const system = buildSystemPrompt({ clientName: client?.full_name, patients: patients || [], clinicSettings });
    const ctx = { clientId, patients: patients || [] };

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

      if (toolUses.length === 0) {
        const text = response.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        if (!text) return { skipped: true, reason: 'model produced no reply' };
        return { sent: true, reply: text };
      }

      const escalate = toolUses.find((u) => u.name === 'escalate_to_staff');
      if (escalate) {
        return { escalated: true, reason: escalate.input?.reason || 'unspecified' };
      }

      messages.push({ role: 'assistant', content: response.content });
      const toolResults = [];
      for (const use of toolUses) {
        const result = await runTool(use, ctx);
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return { escalated: true, reason: 'could not resolve this within the tool-call budget' };
  } catch (err) {
    return { skipped: true, reason: `error: ${err.message}` };
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
