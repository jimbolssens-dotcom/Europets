// app/api/appointments/send-due-reminders/route.js
// GET /api/appointments/send-due-reminders -> the automatic day-before
// appointment reminder pass (see lib/appointmentReminders.js's
// sendTomorrowsAppointmentReminders): a WhatsApp reminder for every
// booked appointment tomorrow that hasn't just been reminded by hand.
//
// Triggered daily at 13:30 UTC = 5:30pm Dubai by Vercel Cron (see
// vercel.json), authenticated with the same CRON_SECRET bearer token as
// app/api/vaccinations/send-due-reminders — anyone else gets a 401.

import { sendTomorrowsAppointmentReminders } from '@/lib/appointmentReminders';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const summary = await sendTomorrowsAppointmentReminders();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
