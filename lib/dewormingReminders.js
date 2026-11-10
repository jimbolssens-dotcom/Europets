// lib/dewormingReminders.js
// The daily deworming reminder run (Jim, 8 Nov), called from the same
// morning cron as the vaccination reminders
// (app/api/vaccinations/send-due-reminders). For every patient on a 3 or
// 6 month deworming reminder (migration 245) whose next deworming is due in
// exactly 3 days, sends the deworming_reminder WhatsApp, or an email when
// there's no number or WhatsApp refuses it, and marks that due date as
// reminded so it's never sent twice. Skips deceased and rehomed pets.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendDewormingReminder, dewormingReminderBody } from '@/lib/metaWhatsapp';
import { sendFallbackEmail } from '@/lib/emailFallback';
import { dubaiLocalDateString } from '@/lib/dubaiTime';
import { dewormingReminderDue, dueLabel, lastDeworming } from '@/lib/deworming';

export async function invoiceDewormingDates(db, patientIds) {
  if (!patientIds.length) return {};
  const { data, error } = await db.rpc('last_deworming_dates', { p_ids: patientIds });
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.patient_id, r.last_date]));
}

async function sendOne(patient, dueDate) {
  const client = patient.clients || {};
  const digits = (client.phone || '').replace(/\D/g, '');
  const label = dueLabel(dueDate);
  const fields = { clientName: client.full_name, patientName: patient.name, dueDateLabel: label };
  const fallbackEmail = client.email
    ? {
        to: client.email,
        subject: `Deworming reminder: ${patient.name}`,
        text: `Hi ${client.full_name || ''},\n\nThis is a friendly reminder from Europets Clinic that ${patient.name} is due for deworming on ${label}.\n\nReply to this email and we'll have the tablets ready for you to pick up, or contact us to book a visit.`,
      }
    : null;

  let waMessageId = null;
  let whatsappError = null;
  if (digits) {
    try {
      waMessageId = await sendDewormingReminder(digits, fields);
    } catch (err) {
      whatsappError = err.message;
    }
  }
  let sentBy = 'whatsapp';
  if (!waMessageId) {
    if (!fallbackEmail) return { ok: false, error: whatsappError || 'no phone or email on file' };
    try {
      await sendFallbackEmail({ clientId: client.id, ...fallbackEmail });
      sentBy = 'email';
    } catch (err) {
      return { ok: false, error: `${whatsappError ? `WhatsApp failed (${whatsappError}), ` : ''}email failed (${err.message})` };
    }
  }

  await supabaseAdmin
    .from('patients')
    .update({ deworm_reminded_for: dueDate, deworm_reminder_sent_at: new Date().toISOString() })
    .eq('id', patient.id);

  if (waMessageId) {
    // 'system', not 'staff': an automated send, so the concierge still
    // answers the client's reply (see lib/vaccinationReminders.js).
    await supabaseAdmin.from('client_messages').insert([
      {
        client_id: client.id,
        phone: digits,
        channel: 'whatsapp',
        sender: 'system',
        body: `Deworming reminder sent: ${dewormingReminderBody(fields)}`,
        wa_message_id: waMessageId,
        status: 'sent',
        fallback_email: fallbackEmail,
      },
    ]);
  }
  return { ok: true, sent_by: sentBy };
}

export async function evaluateAndSendDueDewormingReminders(now = new Date()) {
  const today = dubaiLocalDateString(now);
  const { data: patients, error } = await supabaseAdmin
    .from('patients')
    .select('id, name, deceased, rehomed, deworm_interval_months, deworm_last_date, deworm_reminded_for, clients(id, full_name, phone, email)')
    .gt('deworm_interval_months', 0);
  if (error) throw error;
  const live = (patients || []).filter((p) => !p.deceased && !p.rehomed);
  const invoiceDates = await invoiceDewormingDates(supabaseAdmin, live.map((p) => p.id));

  const results = [];
  for (const p of live) {
    const due = dewormingReminderDue({
      intervalMonths: p.deworm_interval_months,
      lastDate: lastDeworming(p.deworm_last_date, invoiceDates[p.id]),
      remindedFor: p.deworm_reminded_for,
      today,
    });
    if (!due) continue;
    const r = await sendOne(p, due);
    results.push({ patientId: p.id, dueDate: due, sent: r.ok, via: r.sent_by || null, reason: r.ok ? null : r.error });
  }
  return { today, onReminder: live.length, sent: results.filter((r) => r.sent).length, results };
}
