// app/api/clients/[id]/request-message/route.js
// POST /api/clients/:id/request-message -> the client's own side of the
// general chat ({ message }, required) — mirrors POST /api/hospitalizations/
// :id/request-update, just scoped to a client instead of one admission.
// Inserts a 'client' row into client_messages; staff see it in the new
// /messages inbox (and its nav badge — see app/(admin)/layout.js) and
// reply via POST /api/clients/:id/messages.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('client_messages')
    .insert([{ client_id: params.id, sender: 'client', body: message }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
