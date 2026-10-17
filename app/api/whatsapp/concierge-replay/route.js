// app/api/whatsapp/concierge-replay/route.js
//
// GET /api/whatsapp/concierge-replay?token=X&client_id=Y&as_of=ISO
//   -> what the concierge would do now with a client's conversation exactly
//      as it stood at `as_of` (lib/whatsappConcierge.js, asOf): a dry run,
//      nothing sent, booked, moved or logged. For the concierge review's
//      before/after (docs/concierge-review/PLAYBOOK.md), run by Claude on a
//      preview build, which can't carry a staff login.
//
// Only answers when CONCIERGE_REPLAY_TOKEN is set (preview builds only, never
// production) and matches; otherwise it doesn't exist.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { maybeRunConcierge } from '@/lib/whatsappConcierge';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function tokenMatches(given) {
  const expected = process.env.CONCIERGE_REPLAY_TOKEN;
  if (!expected || !given || process.env.VERCEL_ENV === 'production') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (!tokenMatches(searchParams.get('token'))) return new NextResponse('Not found', { status: 404 });
  const clientId = searchParams.get('client_id');
  const asOf = Date.parse(searchParams.get('as_of') || '');
  if (!clientId || !Number.isFinite(asOf)) {
    return NextResponse.json({ error: 'client_id and as_of are required' }, { status: 400 });
  }
  const result = await maybeRunConcierge({ clientId, phone: '', asOf });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
