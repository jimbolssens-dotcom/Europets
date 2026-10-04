// app/api/appointments/[id]/send-reminder/route.js
// POST /api/appointments/:id/send-reminder -> sends an appointment
// reminder from the clinic's own WhatsApp Business number (see
// lib/metaWhatsapp.js's sendAppointmentReminder, and
// create-appointment-reminder-template for the one-time template setup)
// and marks reminder_sent_at on success. Replaces the old "Remind" button
// behavior, which just opened staff's own personal WhatsApp Desktop app
// with a pre-filled message — sent from whatever number that happened to
// be logged into, not the clinic's integrated number.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendAppointmentReminder, sendProcedureReminder, procedureReminderBody } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const { data: appointment, error: fetchError } = await supabase
    .from('appointments')
    .select('id, type, start_time, clients(id, full_name, phone), patients(name)')
    .eq('id', params.id)
    .single();

  if (fetchError || !appointment) {
    return NextResponse.json({ error: 'appointment not found' }, { status: 404 });
  }
  const digits = (appointment.clients?.phone || '').replace(/\D/g, '');
  if (!digits) {
    return NextResponse.json({ error: 'This client has no phone number on file' }, { status: 400 });
  }

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
    dateLabel,
    timeLabel,
  };

  let waMessageId;
  try {
    waMessageId = isProcedure
      ? await sendProcedureReminder(digits, reminderFields)
      : await sendAppointmentReminder(digits, reminderFields);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const { error: markError } = await supabaseAdmin
    .from('appointments')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', params.id);
  if (markError) return NextResponse.json({ error: markError.message }, { status: 500 });

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
        : `Hi ${appointment.clients?.full_name || 'there'}, this is a reminder that ${appointment.patients?.name || 'your pet'} has an appointment at Europets Clinic on ${dateLabel} at ${timeLabel}. See you then! — Europets Clinic`,
      wa_message_id: waMessageId,
      status: 'sent',
    },
  ]);

  return NextResponse.json({ ok: true });
}
