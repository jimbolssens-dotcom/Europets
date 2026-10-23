// app/api/team/[group]/route.js
// Staff only, like the rest of /api.
// GET ?staff_id= -> the group's latest messages and members (lib/teamChat.js),
//      and marks it read for that person.
// POST { staff_id, body?, media_url?, media_type?, media_name?, mentions?,
//      ref? } -> posts a message and sends the phone alerts.

import { NextResponse } from 'next/server';
import { groupThread, postTeamMessage } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

const uuid = (v) => (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) ? v : null);

export async function GET(request, { params }) {
  const staffId = uuid(new URL(request.url).searchParams.get('staff_id'));
  const result = await groupThread(params.group, staffId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const result = await postTeamMessage(params.group, uuid(body.staff_id), body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}
