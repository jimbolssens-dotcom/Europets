// app/api/client-messages/unmatched/[phone]/route.js
// A WhatsApp thread from a number not yet linked to any client record (see
// migrations/130) — reachable only through the /messages inbox's
// "Unmatched WhatsApp numbers" section, not a full client thread page,
// since there's no client_id to route a normal /messages/[id] page to yet.
//
// GET   -> full message history for this phone number.
// POST  -> { body, staff_id } staff reply, sent live via the WhatsApp
//    Cloud API — no client_id needed to answer a new inquiry, so staff
//    aren't forced to create a client record before they can reply to one.
// PATCH -> { client_id } links every message on this phone to that client,
//    folding this thread into their normal /messages/[id] page from then on.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppText } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const phone = params.phone;
  const { data, error } = await supabaseAdmin
    .from('client_messages')
    .select('*, staff(full_name)')
    .eq('phone', phone)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request, { params }) {
  const phone = params.phone;
  const body = await request.json().catch(() => ({}));
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 2000) : '';

  if (!text) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (!body.staff_id) {
    return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
  }

  let waMessageId = null;
  try {
    waMessageId = await sendWhatsAppText(phone, text);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const { data, error } = await supabaseAdmin
    .from('client_messages')
    .insert([
      {
        phone,
        channel: 'whatsapp',
        sender: 'staff',
        staff_id: body.staff_id,
        body: text,
        wa_message_id: waMessageId,
        status: 'sent',
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request, { params }) {
  const phone = params.phone;
  const body = await request.json().catch(() => ({}));
  if (!body.client_id) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('client_messages')
    .update({ client_id: body.client_id })
    .eq('phone', phone)
    .is('client_id', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
