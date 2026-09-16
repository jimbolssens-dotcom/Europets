// app/api/hospitalizations/[id]/messages/route.js
// GET  /api/hospitalizations/:id/messages  -> the full two-way chat
//                                              thread for this admission
//                                              (both 'client' and 'staff'
//                                              rows, oldest first). Public
//                                              — the client portal reads
//                                              this with no login, same as
//                                              the rest of the portal.
// POST /api/hospitalizations/:id/messages  -> staff's reply ({ body,
//                                              staff_id }). NOT public —
//                                              this is what keeps a client
//                                              from posting a message that
//                                              impersonates the clinic;
//                                              the client's own side of
//                                              the conversation goes
//                                              through the already-public
//                                              POST .../request-update
//                                              instead. Clears the
//                                              "owner is waiting" flag,
//                                              same as logging a
//                                              worksheet entry does.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('hospitalization_messages')
    .select('*, staff(full_name)')
    .eq('hospitalization_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 2000) : '';

  if (!text) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (!body.staff_id) {
    return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('hospitalization_messages')
    .insert([{ hospitalization_id: params.id, sender: 'staff', staff_id: body.staff_id, body: text }])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A staff reply IS the response the owner was waiting on — clear the
  // flag, same as POST .../notes does for a worksheet entry.
  await supabaseAdmin
    .from('hospitalizations')
    .update({ update_requested_at: null, update_request_message: null })
    .eq('id', params.id);

  return NextResponse.json(data, { status: 201 });
}
