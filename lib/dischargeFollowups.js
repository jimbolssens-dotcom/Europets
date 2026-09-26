// lib/dischargeFollowups.js
// Post-discharge "how's recovery going?" WhatsApp check-ins for surgical/
// dental stays — review-first by default (see migration 146's own comment
// for the full design). Three pieces:
//
//   createDischargeFollowupIfEligible(hospitalizationId) — called once,
//     right at discharge (see lib/hospitalizationDischarge.js). Only
//     creates a row when the stay actually had a surgical or dental
//     report; a plain boarding/observation stay gets nothing.
//
//   evaluateDueFollowups() — called from GET /api/discharge-followups
//     (i.e. whenever staff open the Follow-ups page) rather than on a
//     schedule, since this app has no cron infrastructure yet. Re-checks
//     eligibility for every 'scheduled' row whose due_at has passed —
//     right at the moment it's about to become visible/sendable, not at
//     creation time, so a patient readmitted or marked deceased in the
//     meantime is caught. Skips (with a visible reason) or drafts +
//     promotes to 'ready_for_review'.
//
//   sendDischargeFollowup(row, message, sentBy) — the actual send, shared
//     by the staff "Send" button (PATCH /api/discharge-followups/:id) and
//     by evaluateDueFollowups itself when DISCHARGE_FOLLOWUP_AUTOSEND is
//     "true" — flipping that env var later is the only change needed to
//     go from review-first to fully automated, since it's the same
//     eligibility check and the same send call either way.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendFirstContactMessage } from '@/lib/metaWhatsapp';

// How long after discharge a follow-up becomes due — long enough that the
// patient is actually settled at home, short enough the procedure is still
// fresh for the client. Easy to retune without touching the eligibility/
// send logic below.
const FOLLOWUP_DELAY_HOURS = Number(process.env.DISCHARGE_FOLLOWUP_DELAY_HOURS) || 48;

export async function createDischargeFollowupIfEligible(hospitalizationId) {
  const [{ data: hosp }, { data: surgical }, { data: dental }] = await Promise.all([
    supabase.from('hospitalizations').select('id, patient_id, client_id, discharged_at').eq('id', hospitalizationId).single(),
    supabase
      .from('surgical_reports')
      .select('procedure_name, surgeon_id, postop_instructions')
      .eq('hospitalization_id', hospitalizationId),
    supabase
      .from('dental_reports')
      .select('procedures_performed, performed_by, postop_instructions')
      .eq('hospitalization_id', hospitalizationId),
  ]);

  if (!hosp) return;

  const reports = [
    ...(surgical || []).map((r) => ({ procedureName: r.procedure_name, vetId: r.surgeon_id, postop: r.postop_instructions })),
    ...(dental || []).map((r) => ({ procedureName: r.procedures_performed, vetId: r.performed_by, postop: r.postop_instructions })),
  ];
  // Nothing surgical/dental on this stay — a plain boarding/observation
  // admission never gets a follow-up.
  if (reports.length === 0) return;

  const procedureName = reports.map((r) => r.procedureName).filter(Boolean).join(' & ') || null;
  const vetId = reports.find((r) => r.vetId)?.vetId || null;
  const postopInstructions = reports.map((r) => r.postop).filter(Boolean).join('\n\n') || null;
  const dischargedAt = hosp.discharged_at ? new Date(hosp.discharged_at) : new Date();
  const dueAt = new Date(dischargedAt.getTime() + FOLLOWUP_DELAY_HOURS * 60 * 60 * 1000);

  const { error } = await supabaseAdmin.from('discharge_followups').insert([
    {
      hospitalization_id: hospitalizationId,
      patient_id: hosp.patient_id,
      client_id: hosp.client_id,
      procedure_name: procedureName,
      vet_id: vetId,
      postop_instructions: postopInstructions,
      due_at: dueAt.toISOString(),
    },
  ]);
  // 23505 = the unique(hospitalization_id) constraint — this stay already
  // has a follow-up (e.g. discharge effects ran twice); not an error.
  if (error && error.code !== '23505') throw error;
}

function buildFollowupMessage(row) {
  const clientFirst = (row.clients?.full_name || 'there').split(' ')[0];
  const patientName = row.patients?.name || 'your pet';
  const vetName = row.staff?.full_name || null;
  const procedure = row.procedure_name || 'their recent procedure';
  const intro = vetName ? `${vetName} wanted` : 'We wanted';
  return `Hi ${clientFirst}! ${intro} to check in and see how ${patientName} is doing since ${procedure}. How's the recovery going?`;
}

async function skipFollowup(id, reason) {
  await supabaseAdmin.from('discharge_followups').update({ status: 'skipped', skip_reason: reason }).eq('id', id);
}

// Re-checked at due time, not creation time — a patient marked deceased,
// rehomed, or readmitted between discharge and the follow-up's due date
// must never get a "how's recovery going?" message.
async function checkStillEligible(row) {
  if (row.patients?.deceased) return { eligible: false, reason: 'Patient marked deceased' };
  if (row.patients?.rehomed) return { eligible: false, reason: 'Patient marked rehomed' };
  if (!row.clients?.phone) return { eligible: false, reason: 'No phone number on file for this client' };

  const { data: laterAdmission } = await supabase
    .from('hospitalizations')
    .select('id')
    .eq('patient_id', row.patient_id)
    .eq('status', 'admitted')
    .neq('id', row.hospitalization_id)
    .limit(1)
    .maybeSingle();
  if (laterAdmission) return { eligible: false, reason: 'Patient has been readmitted to hospitalization since' };

  return { eligible: true };
}

export async function evaluateDueFollowups() {
  const { data: due } = await supabase
    .from('discharge_followups')
    .select('*, patients(name, deceased, rehomed), clients(full_name, phone), staff:vet_id(full_name)')
    .eq('status', 'scheduled')
    .lte('due_at', new Date().toISOString());

  const autosend = process.env.DISCHARGE_FOLLOWUP_AUTOSEND === 'true';

  for (const row of due || []) {
    const { eligible, reason } = await checkStillEligible(row);
    if (!eligible) {
      await skipFollowup(row.id, reason);
      continue;
    }
    const draft = buildFollowupMessage(row);
    if (autosend) {
      try {
        await sendDischargeFollowup(row, draft, null);
      } catch (err) {
        await supabaseAdmin
          .from('discharge_followups')
          .update({ message_draft: draft, skip_reason: `Auto-send failed: ${err.message}` })
          .eq('id', row.id);
      }
    } else {
      await supabaseAdmin.from('discharge_followups').update({ status: 'ready_for_review', message_draft: draft }).eq('id', row.id);
    }
  }
}

export async function sendDischargeFollowup(row, message, sentBy) {
  const digits = (row.clients?.phone || '').replace(/\D/g, '');
  if (!digits) throw new Error('No phone number on file for this client');

  const waMessageId = await sendFirstContactMessage(digits, { clientName: row.clients?.full_name, clientMessage: message });
  await supabaseAdmin.from('client_messages').insert([
    {
      client_id: row.client_id,
      phone: digits,
      channel: 'whatsapp',
      sender: 'staff',
      body: message,
      wa_message_id: waMessageId,
      status: 'sent',
    },
  ]);
  await supabaseAdmin
    .from('discharge_followups')
    .update({ status: 'sent', message_draft: message, sent_at: new Date().toISOString(), sent_by: sentBy || null })
    .eq('id', row.id);
}
