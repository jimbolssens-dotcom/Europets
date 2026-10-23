// app/api/social-duty/sweep/route.js
// GET -> the daily Social post duty's next step (lib/socialDuty.js): pick
// today's person at 8am, nudge at noon and 4pm, tell the admin at 6pm
// if there's still no post. Also the daily rescue updates' reminders
// (lib/rescueUpdates.js), and switching off interns whose last day has
// passed (lib/staffExpiry.js). Vercel Cron (vercel.json); public in
// middleware.js, verified with the same CRON_SECRET as the other cron routes.

import { NextResponse } from 'next/server';
import { runDutySweep } from '@/lib/socialDuty';
import { runRescueUpdateSweep } from '@/lib/rescueUpdates';
import { expireTemporaryStaff } from '@/lib/staffExpiry';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const duty = await runDutySweep();
  const rescue = await runRescueUpdateSweep().catch((err) => ({ error: err.message }));
  // Interns whose last day has passed (migration 223).
  const expired = await expireTemporaryStaff().catch((err) => ({ error: err.message }));
  return NextResponse.json({ ...duty, rescue, expired });
}
