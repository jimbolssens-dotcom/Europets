// app/api/appointments/[id]/send-reminder/route.js
// POST /api/appointments/:id/send-reminder -> sends an appointment
// reminder from the clinic's own WhatsApp Business number (see
// lib/appointmentReminders.js, which the automatic 5:30pm day-before pass
// in app/api/appointments/send-due-reminders shares) and marks
// reminder_sent_at on success. Replaces the old "Remind" button
// behavior, which just opened staff's own personal WhatsApp Desktop app
// with a pre-filled message — sent from whatever number that happened to
// be logged into, not the clinic's integrated number.

import { supabase } from '@/lib/supabaseClient';
import { sendReminderForAppointment, REMINDER_APPOINTMENT_FIELDS } from '@/lib/appointmentReminders';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const { data: appointment, error: fetchError } = await supabase
    .from('appointments')
    .select(REMINDER_APPOINTMENT_FIELDS)
    .eq('id', params.id)
    .single();

  if (fetchError || !appointment) {
    return NextResponse.json({ error: 'appointment not found' }, { status: 404 });
  }

  const result = await sendReminderForAppointment(appointment);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
