// app/api/team/messages/[id]/replied/route.js
// Staff only. POST { staff_id } -> marks a shared client message as
// answered (the reply itself went through POST /api/clients/:id/messages,
// from the clinic WhatsApp number), so the team sees "✓ Replied by ...".

import { NextResponse } from 'next/server';
import { markReplied } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/.test(String(body.staff_id || ''))) return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
  const result = await markReplied(params.id, body.staff_id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
