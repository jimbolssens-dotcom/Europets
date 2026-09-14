// app/api/hospitalizations/[id]/request-update/route.js
// POST /api/hospitalizations/:id/request-update
//   -> owner-facing: sends a chat message to staff ({ message }, required)
//      and flags this admission as waiting on a reply. Powers the message
//      box on the client portal page — the client can send as many of
//      these as they like over the course of the stay, each one landing
//      in hospitalization_messages (see migration 097) as a 'client' row,
//      which GET .../messages returns as the full two-way thread. Staff
//      see the pending flag as a blinking cage on the Cage Layout page
//      (desktop and mobile) until it's cleared — either automatically the
//      moment staff post a reply (POST .../messages) or log a worksheet
//      entry (see the notes route), or manually via PATCH
//      /api/hospitalizations/:id { update_requested_at: null }.
//
// Unauthenticated like the rest of the portal — there's no client login,
// same as everywhere else in the app.

import { supabase } from '@/lib/supabaseClient';
import { attachCages } from '@/lib/attachCages';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const { error: messageError } = await supabase
    .from('hospitalization_messages')
    .insert([{ hospitalization_id: params.id, sender: 'client', body: message }]);

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('hospitalizations')
    .update({ update_requested_at: new Date().toISOString(), update_request_message: message })
    .eq('id', params.id)
    .select('*, patients(id, name, species, current_weight_kg), clients(id, full_name, phone), rooms(name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(await attachCages(data));
}
