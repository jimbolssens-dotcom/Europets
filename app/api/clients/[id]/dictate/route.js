// app/api/clients/[id]/dictate/route.js
// Staff only, like the rest of /api.
// POST { audio_url } -> { transcript, draft }: a spoken reply transcribed
//      and written up by the AI (lib/dictation.js), for staff to review and
//      send from the reply box. Sends nothing itself.

import { NextResponse } from 'next/server';
import { dictateReply } from '@/lib/dictation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.audio_url !== 'string' || !/^https:\/\//.test(body.audio_url)) {
    return NextResponse.json({ error: 'audio_url is required' }, { status: 400 });
  }
  const result = await dictateReply({ audioUrl: body.audio_url, clientId: params.id });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json(result);
}
