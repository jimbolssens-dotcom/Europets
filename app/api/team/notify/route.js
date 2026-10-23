// app/api/team/notify/route.js
// Staff only. PUT { staff_id, level: 'all' | 'mentions' | 'off' } -> that
// person's phone alerts for team chat messages (an @mention always alerts).

import { NextResponse } from 'next/server';
import { setNotifyLevel } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

export async function PUT(request) {
  const body = await request.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/.test(String(body.staff_id || ''))) return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
  const result = await setNotifyLevel(body.staff_id, body.level);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
