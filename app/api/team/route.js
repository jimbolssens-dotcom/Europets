// app/api/team/route.js
// Staff only, like the rest of /api.
// GET ?staff_id= -> the team chat groups this person is in (migration 219,
//      lib/teamChat.js), each with its unread count and last message, and
//      their alert setting.

import { NextResponse } from 'next/server';
import { teamSummary, getNotifyLevel } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const staffId = new URL(request.url).searchParams.get('staff_id') || null;
  const valid = staffId && /^[0-9a-f-]{36}$/.test(staffId) ? staffId : null;
  const [groups, level] = await Promise.all([teamSummary(valid), valid ? getNotifyLevel(valid) : 'mentions']);
  return NextResponse.json({ groups, level }, { headers: { 'Cache-Control': 'no-store' } });
}
