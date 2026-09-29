// app/api/whatsapp/nudge-sweep/route.js
// GET -> runs sweepUnansweredWhatsAppThreads (lib/whatsappUnanswered.js) —
// the "nobody answered within 5 minutes" backstop for WhatsApp. Triggered
// by Vercel Cron (see vercel.json), same CRON_SECRET bearer-token pattern
// as the other two cron routes (backups/nightly, vaccinations/send-due-
// reminders).
//
// Public — a cron request can't carry a staff cookie — verified via
// CRON_SECRET instead (see middleware.js's PUBLIC_PATTERNS for this exact
// path). Deliberately not under /api/accounting for the same reason those
// other cron routes aren't: that path's extra password cookie has no way
// to be carried by a scheduled request either.

import { sweepUnansweredWhatsAppThreads } from '@/lib/whatsappUnanswered';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await sweepUnansweredWhatsAppThreads();
  return NextResponse.json(result);
}
