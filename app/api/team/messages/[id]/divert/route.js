// app/api/team/messages/[id]/divert/route.js
// Staff only. POST { staff_id, group } -> passes this team message on to
// another group, as from Europets (lib/teamChat.js#divertTeamMessage,
// migration 224); anyone can, whether or not they're in that group.

import { NextResponse } from 'next/server';
import { divertTeamMessage } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/.test(String(body.staff_id || ''))) return NextResponse.json({ error: 'Pick who you are first.' }, { status: 400 });
  const result = await divertTeamMessage(params.id, String(body.group || ''), body.staff_id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}
