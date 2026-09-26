// app/api/vaccinations/send-reminder/route.js
// POST /api/vaccinations/send-reminder  { ids: [uuid, ...] }
//   -> sends one grouped vaccination-due reminder over WhatsApp and marks
//      every id reminded on success (see lib/vaccinationReminders.js's
//      sendVaccinationReminderForIds — shared with the fully-automated
//      "due in exactly 7 days" daily trigger, GET
//      /api/vaccinations/send-due-reminders, so this button and that
//      trigger can never drift apart in behavior).
//
// ids is the same grouping the Vaccination Reminders page already computes
// (one message per patient+due-date, covering however many vaccines fall
// on it) — see app/(admin)/vaccinations/page.jsx's groupRows.

import { sendVaccinationReminderForIds } from '@/lib/vaccinationReminders';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids is required' }, { status: 400 });
  }

  const result = await sendVaccinationReminderForIds(ids);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, lapsed: result.lapsed }, { status: result.status || 500 });
  }
  return NextResponse.json({ ok: true });
}
