// app/api/vaccinations/send-due-reminders/route.js
// GET /api/vaccinations/send-due-reminders -> the fully-automated daily
// vaccination reminder pass (see lib/vaccinationReminders.js's
// evaluateAndSendDueVaccinationReminders) — sends a WhatsApp reminder for
// every vaccination due in EXACTLY 7 days, with no staff review or button
// click involved at all.
//
// Triggered once a day by Vercel Cron (see vercel.json), which signs its
// own requests with a Bearer token matching the CRON_SECRET project env
// var — anyone else calling this without it gets a 401. Set CRON_SECRET in
// Vercel's project settings (any random string) for this to actually run;
// until then this route just 401s harmlessly on schedule.

import { evaluateAndSendDueVaccinationReminders } from '@/lib/vaccinationReminders';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const summary = await evaluateAndSendDueVaccinationReminders();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
