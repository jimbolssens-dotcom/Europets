// app/api/social-duty/sweep/route.js
// GET -> the daily Social post duty's next step (lib/socialDuty.js): pick
// today's person at 8am, nudge at noon and 4pm, tell the admin at 6pm
// if there's still no post. Vercel Cron (vercel.json); public in
// middleware.js, verified with the same CRON_SECRET as the other cron routes.

import { NextResponse } from 'next/server';
import { runDutySweep } from '@/lib/socialDuty';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await runDutySweep());
}
