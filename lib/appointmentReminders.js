// lib/appointmentReminders.js
// Sends one appointment's WhatsApp reminder from the clinic's own number —
// the regular appointment_reminder, or procedure_reminder for a dental/
// surgery appointment (see lib/metaWhatsapp.js) — and logs it to the
// client's thread. Shared by the staff "Remind" button
// (app/api/appointments/[id]/send-reminder) and the automatic daily pass
// below (app/api/appointments/send-due-reminders, Vercel Cron), so a
// reminder reads exactly the same whichever way it went out.

import { supabaseAdmin } from './supabaseAdmin';
import { sendAppointmentReminder, sendProcedureReminder, procedureReminderBody } from './metaWhatsapp';
import { procedureLabel } from './procedureLabel';
import { dubaiDayBoundaries } from './dubaiTime';

export const REMINDER_APPOINTMENT_FIELDS = 'id, type, reason, start_time, clients(id, full_name, phone), patients(name)';

const DAY_MS = 24 * 60 * 60 * 1000;

// Returns { ok: true } or { ok: false, status, error } — never throws, so
// one bad appointment can't stop the daily pass from reaching the rest.
export async function sendReminderForAppointment(appointment) {
  const digits = (appointment.clients?.phone || '').replace(/\D/g, '');
  if (!digits) return { ok: false, status: 400, error: 'This client has no phone number on file' };

  // timeZone set explicitly — this runs on Vercel's servers, which are on
  // UTC, not the clinic's zone, so without it an 11:00am Dubai (UTC+4)
  // appointment went out to the client as "7:00 am" (same bug, and fix,
  // as the booking confirmation in app/api/intake-requests/[id]).
  const dateLabel = new Date(appointment.start_time).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Dubai',
  });
  const timeLabel = new Date(appointment.start_time).toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Dubai',
  });

  // Dental and surgical appointments (both stored as type 'surgery') get
  // their own reminder: a morning drop-off window and fasting instructions
  // instead of the booked slot's time, which isn't when the client should
  // actually arrive (see PROCEDURE_REMINDER_TEXT in lib/metaWhatsapp.js).
  const isProcedure = appointment.type === 'surgery';
  const reminderFields = {
    clientName: appointment.clients?.full_name,
    patientName: appointment.patients?.name,
    procedure: procedureLabel(appointment.reason),
    dateLabel,
    timeLabel,
  };

  let waMessageId;
  try {
    waMessageId = isProcedure
      ? await sendProcedureReminder(digits, reminderFields)
      : await sendAppointmentReminder(digits, reminderFields);
  } catch (err) {
    return { ok: false, status: 502, error: err.message };
  }

  const { error: markError } = await supabaseAdmin
    .from('appointments')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', appointment.id);
  if (markError) return { ok: false, status: 500, error: markError.message };

  await supabaseAdmin.from('client_messages').insert([
    {
      client_id: appointment.clients.id,
      phone: digits,
      channel: 'whatsapp',
      // 'system', not 'staff' — automated send, no human typed this. See
      // migration 163: the AI concierge treats a 'staff' sender as "a
      // human already took over," which falsely blocked it from acting on
      // a client's reply to an automated notice.
      sender: 'system',
      body: isProcedure
        ? procedureReminderBody(reminderFields)
        : `Hi ${appointment.clients?.full_name || 'there'}, this is a reminder that ${appointment.patients?.name || 'your pet'} has an appointment at Europets Clinic on ${dateLabel} at ${timeLabel}. See you then! Europets Clinic`,
      wa_message_id: waMessageId,
      status: 'sent',
    },
  ]);

  return { ok: true };
}

// The automatic daily pass, run at 5:30pm Dubai time: reminds every still-
// booked appointment TOMORROW (Dubai calendar day) that has a client phone
// and hasn't already been reminded in the last two days — so a staff
// member pressing Remind by hand earlier never causes a duplicate, but an
// appointment reminded long ago (e.g. when it was first booked) still gets
// its day-before one. Meetings have no client and are never included.
// Sent one at a time, so one failure (e.g. procedure_reminder not yet
// approved by Meta) is just counted and the rest still go out.
export async function sendTomorrowsAppointmentReminders(now = new Date()) {
  const { startUtcMs } = dubaiDayBoundaries(now);
  const tomorrowStart = new Date(startUtcMs + DAY_MS).toISOString();
  const tomorrowEnd = new Date(startUtcMs + 2 * DAY_MS).toISOString();
  const recentCutoff = new Date(now.getTime() - 2 * DAY_MS).toISOString();

  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select(REMINDER_APPOINTMENT_FIELDS)
    .eq('status', 'booked')
    .neq('type', 'meeting')
    .not('patient_id', 'is', null)
    .gte('start_time', tomorrowStart)
    .lt('start_time', tomorrowEnd)
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${recentCutoff}`)
    .order('start_time');
  if (error) throw error;

  const summary = { date_from: tomorrowStart, date_to: tomorrowEnd, considered: appointments.length, sent: 0, skipped_no_phone: 0, failed: [] };
  for (const appointment of appointments) {
    if (!(appointment.clients?.phone || '').replace(/\D/g, '')) {
      summary.skipped_no_phone += 1;
      continue;
    }
    const result = await sendReminderForAppointment(appointment);
    if (result.ok) summary.sent += 1;
    else summary.failed.push({ appointment_id: appointment.id, type: appointment.type, error: result.error });
  }
  if (summary.failed.length) console.error('Some automatic appointment reminders failed', summary.failed);
  return summary;
}
