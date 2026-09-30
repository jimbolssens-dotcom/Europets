// lib/vaccinationReminders.js
// Vaccination-due WhatsApp reminders — two entry points:
//
//   sendVaccinationReminderForIds(ids) — the actual send (one message per
//     patient+due-date group, see the Vaccinations page's groupRows) —
//     shared by the staff "💬 WhatsApp" button (POST
//     /api/vaccinations/send-reminder) and the fully-automated daily
//     trigger below, so neither can drift from the other's behavior.
//
//   evaluateAndSendDueVaccinationReminders() — called once a day by Vercel
//     Cron (see vercel.json and GET /api/vaccinations/send-due-reminders)
//     for every vaccination due in EXACTLY 7 days — no staff review, no
//     button click, nothing to approve. Still skips a deceased/rehomed
//     patient or a client with no phone on file, and still runs through
//     lib/vaccinationReminderPolicy's cooldown/cap/cutoff via
//     sendVaccinationReminderForIds — the same safety checks the manual
//     button always had, just with no human deciding when to click it.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendVaccinationReminder } from '@/lib/metaWhatsapp';
import { reminderEligibility } from '@/lib/vaccinationReminderPolicy';
import { dubaiLocalDateString } from '@/lib/dubaiTime';

function listNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// Sends one grouped reminder for the given vaccination row ids — they must
// all share one patient (and, in practice, one next_due_date, same
// grouping the Vaccinations page computes) — and marks them reminded on
// success. Returns { ok: false, error, status } instead of throwing, so
// both callers below can turn that straight into an HTTP response or a
// per-patient log entry without their own try/catch.
export async function sendVaccinationReminderForIds(ids) {
  const { data: rows, error: rowsError } = await supabase
    .from('vaccinations')
    .select('id, patient_id, vaccine_name, next_due_date, reminder_sent_at, reminder_count')
    .in('id', ids);
  if (rowsError) return { ok: false, error: rowsError.message, status: 500 };
  if (!rows || rows.length !== ids.length) {
    return { ok: false, error: 'one or more vaccination records were not found', status: 404 };
  }
  const patientId = rows[0].patient_id;
  if (!rows.every((r) => r.patient_id === patientId)) {
    return { ok: false, error: 'ids must all belong to the same patient', status: 400 };
  }

  // Enforced here, not just in a caller's UI — a lapsed/badly-overdue
  // vaccine, or one already reminded recently, stops being auto-reminded
  // rather than nagging a client who's clearly not coming back for it.
  const eligibility = reminderEligibility({
    nextDueDate: rows[0].next_due_date,
    reminderSentAt: rows[0].reminder_sent_at,
    reminderCount: rows[0].reminder_count,
  });
  if (!eligibility.canSendNow) {
    return { ok: false, error: eligibility.reason, lapsed: eligibility.lapsed, status: 409 };
  }

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('name, clients(id, full_name, phone)')
    .eq('id', patientId)
    .single();
  if (patientError || !patient) return { ok: false, error: 'patient not found', status: 404 };

  const digits = (patient.clients?.phone || '').replace(/\D/g, '');
  if (!digits) {
    return { ok: false, error: 'This client has no phone number on file to send a WhatsApp reminder to', status: 400 };
  }

  const vaccineNames = listNames(rows.map((r) => r.vaccine_name));
  const dueDateLabel = new Date(`${rows[0].next_due_date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let waMessageId;
  try {
    waMessageId = await sendVaccinationReminder(digits, {
      clientName: patient.clients?.full_name,
      patientName: patient.name,
      vaccineNames,
      dueDateLabel,
    });
  } catch (err) {
    return { ok: false, error: err.message, status: 502 };
  }

  const { error: markError } = await supabaseAdmin
    .from('vaccinations')
    .update({ reminder_sent_at: new Date().toISOString(), reminder_count: (rows[0].reminder_count || 0) + 1 })
    .in('id', ids);
  if (markError) return { ok: false, error: markError.message, status: 500 };

  await supabaseAdmin.from('client_messages').insert([
    {
      client_id: patient.clients.id,
      phone: digits,
      channel: 'whatsapp',
      sender: 'staff',
      body: `Vaccination reminder sent: ${patient.name} — ${vaccineNames} due ${dueDateLabel}`,
      wa_message_id: waMessageId,
      status: 'sent',
    },
  ]);

  return { ok: true };
}

// The fully-automated daily pass — every vaccination due in EXACTLY 7
// days from today (Dubai local), grouped by patient, sent with no staff
// involvement at all. Safe to call more than once on the same day:
// sendVaccinationReminderForIds's own cooldown check makes a repeat call
// for an already-reminded group a no-op rather than a duplicate send.
export async function evaluateAndSendDueVaccinationReminders() {
  const targetDate = dubaiLocalDateString(new Date(Date.now() + 7 * 86400000));

  const { data: rows, error: rowsError } = await supabase
    .from('vaccinations')
    .select('id, patient_id')
    .eq('next_due_date', targetDate);
  if (rowsError) throw rowsError;
  if (!rows || rows.length === 0) return { targetDate, groups: 0, sent: 0, skipped: 0, results: [] };

  const patientIds = [...new Set(rows.map((r) => r.patient_id))];
  const { data: patients, error: patientsError } = await supabase
    .from('patients')
    .select('id, name, deceased, rehomed, clients(phone)')
    .in('id', patientIds);
  if (patientsError) throw patientsError;
  const patientsById = Object.fromEntries((patients || []).map((p) => [p.id, p]));

  const byPatient = new Map();
  for (const r of rows) {
    if (!byPatient.has(r.patient_id)) byPatient.set(r.patient_id, []);
    byPatient.get(r.patient_id).push(r.id);
  }

  const results = [];
  for (const [patientId, ids] of byPatient) {
    const patient = patientsById[patientId];
    if (!patient) {
      results.push({ patientId, sent: false, reason: 'patient not found' });
      continue;
    }
    if (patient.deceased || patient.rehomed) {
      results.push({ patientId, patientName: patient.name, sent: false, reason: patient.deceased ? 'deceased' : 'rehomed' });
      continue;
    }
    if (!patient.clients?.phone) {
      results.push({ patientId, patientName: patient.name, sent: false, reason: 'no phone on file' });
      continue;
    }
    const result = await sendVaccinationReminderForIds(ids);
    results.push({ patientId, patientName: patient.name, sent: result.ok, reason: result.ok ? null : result.error });
  }

  return {
    targetDate,
    groups: byPatient.size,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => !r.sent).length,
    results,
  };
}
