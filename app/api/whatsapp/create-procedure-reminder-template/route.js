// app/api/whatsapp/create-procedure-reminder-template/route.js
// POST /api/whatsapp/create-procedure-reminder-template -> the one-time
// (safe to re-run) setup step for dental/surgery reminders: proposes the
// procedure_reminder template to Meta for review (see lib/metaWhatsapp.js's
// submitProcedureReminderTemplate). Until Meta approves it, the Remind
// button on a dental/surgery appointment fails with Meta's error rather
// than falling back to the regular reminder, which would give the client
// a specific arrival time and no fasting instructions.
// Staff-gated like any other non-public route (see middleware.js).

import { submitProcedureReminderTemplate } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const data = await submitProcedureReminderTemplate();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
