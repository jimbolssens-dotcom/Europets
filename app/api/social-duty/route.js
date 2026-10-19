// app/api/social-duty/route.js
// GET  -> today's Social post duty (lib/socialDuty.js): who, the idea, done or not.
// POST { action: 'pass' } -> hand today's turn to the next person (off sick,
//      in theatre all day); { action: 'assign' } -> pick today's person now
//      if the morning sweep hasn't yet.
// Staff only, like the rest of /api.

import { NextResponse } from 'next/server';
import { getTodayDuty, passTodayDuty, runDutySweep } from '@/lib/socialDuty';

export const dynamic = 'force-dynamic';

function present(duty) {
  if (!duty) return { duty: null };
  return {
    duty: {
      duty_date: duty.duty_date,
      staff_id: duty.staff_id,
      staff_name: duty.staff?.full_name || null,
      idea: duty.idea,
      done_at: duty.done_at,
      post_id: duty.post_id,
    },
  };
}

export async function GET() {
  return NextResponse.json(present(await getTodayDuty()), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const result = body.action === 'pass' ? await passTodayDuty() : await runDutySweep();
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(present(await getTodayDuty()));
}
