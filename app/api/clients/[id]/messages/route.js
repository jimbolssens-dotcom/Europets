// app/api/clients/[id]/messages/route.js
// GET  /api/clients/:id/messages  -> the full two-way chat thread for this
//      client (both 'client' and 'staff' rows, oldest first, app and
//      WhatsApp channels both — see migrations/130). Used by both the
//      client app's own chat page and the staff inbox thread view.
// POST /api/clients/:id/messages  -> staff's reply
//      ({ body, staff_id, channel? }). channel defaults to 'app' (an
//      ordinary client-app chat row, exactly as before); 'whatsapp' also
//      sends the text live via the WhatsApp Cloud API to this client's own
//      phone number (clients.phone — see migrations/055) before logging
//      it, and fails the request if that send fails rather than logging a
//      reply that was never actually delivered. The client's own side of
//      the app conversation goes through POST /api/clients/:id/request-
//      message instead — same client-send vs. staff-reply split as the
//      hospitalization chat (see /api/hospitalizations/:id/messages and
//      .../request-update), kept here even though neither route is public
//      yet (the whole client-app section is still behind the staff PIN
//      gate — see app/client-app/layout.js) so opening the client-send
//      route up later needs no further changes to this one. A client's
//      WhatsApp side always arrives via the webhook instead (see
//      app/api/whatsapp/webhook), never through this route.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppText } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
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
  const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'app';

  if (!text) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (!body.staff_id) {
    return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
  }

  const row = { client_id: params.id, sender: 'staff', staff_id: body.staff_id, body: text, channel };

  if (channel === 'whatsapp') {
    const { data: client } = await supabase.from('clients').select('phone').eq('id', params.id).maybeSingle();
    const digits = (client?.phone || '').replace(/\D/g, '');
    if (!digits) {
      return NextResponse.json(
        { error: 'This client has no phone number on file to send a WhatsApp reply to' },
        { status: 400 }
      );
    }
    try {
      row.wa_message_id = await sendWhatsAppText(digits, text);
      row.status = 'sent';
      row.phone = digits;
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('client_messages')
    .insert([row])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
