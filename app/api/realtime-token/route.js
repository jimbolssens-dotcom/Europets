// app/api/realtime-token/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// GET -> { access_token, expires_at } for live updates; see
// lib/realtimeStaffToken.js.

import { getStaffRealtimeToken } from '@/lib/realtimeStaffToken';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getStaffRealtimeToken(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('realtime-token:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
