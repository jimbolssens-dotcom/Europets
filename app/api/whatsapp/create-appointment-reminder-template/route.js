// app/api/whatsapp/create-appointment-reminder-template/route.js
// POST /api/whatsapp/create-appointment-reminder-template -> the one-time
// (safe to re-run) setup step for sending appointment reminders from the
// clinic's own WhatsApp Business number instead of staff's personal
// WhatsApp: proposes the appointment_reminder template to Meta for review
// (see lib/metaWhatsapp.js's submitAppointmentReminderTemplate). Nothing
// actually sends over WhatsApp until Meta approves it — that review is
// external and can't be triggered or sped up from here; check status
// afterward in WhatsApp Manager > Account tools > Message templates, or
// right here on the Messages page once it's wired in.
// Staff-gated like any other non-public route (see middleware.js).

import { submitAppointmentReminderTemplate } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await submitAppointmentReminderTemplate();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
