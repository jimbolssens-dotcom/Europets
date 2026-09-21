// app/api/clients/[id]/messages/route.js
// GET  /api/clients/:id/messages  -> the full two-way chat thread for this
//      client (both 'client' and 'staff' rows, oldest first). Used by both
//      the client app's own chat page and the staff inbox thread view.
// POST /api/clients/:id/messages  -> staff's reply ({ body, staff_id }).
//      The client's own side of the conversation goes through POST
//      /api/clients/:id/request-message instead — same client-send vs.
//      staff-reply split as the hospitalization chat (see
//      /api/hospitalizations/:id/messages and .../request-update), kept
//      here even though neither route is public yet (the whole client-app
//      section is still behind the staff PIN gate — see app/client-app/
//      layout.js) so opening the client-send route up later needs no
//      further changes to this one.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  // Reachable without the staff PIN now (the client app's own chat tab —
  // see middleware.js) — a non-staff caller must be reading their own
  // thread. POST (the staff reply) stays off the public path list
  // entirely, so it still requires the staff PIN as before.
  if (!(await isStaffRequest(request))) {
    const sessionClientId = await getClientSession(request);
    if (!sessionClientId || sessionClientId !== params.id) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from('client_messages')
    .select('*, staff(full_name)')
    .eq('client_id', params.id)
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
    .from('client_messages')
    .insert([{ client_id: params.id, sender: 'staff', staff_id: body.staff_id, body: text }])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
