// app/api/client-messages/unmatched/[phone]/route.js
// A WhatsApp thread from a number not yet linked to any client record (see
// migrations/130) — reachable only through the /messages inbox's
// "Unmatched WhatsApp numbers" section, not a full client thread page,
// since there's no client_id to route a normal /messages/[id] page to yet.
//
// GET   -> full message history for this phone number.
// POST  -> { body, staff_id, client_name? } staff message, sent live via
//    the WhatsApp Cloud API — no client_id needed, so staff aren't forced
//    to create a client record before they can reply to an inquiry or
//    write to someone whose registration form is waiting for review
//    (app/_components/IntakeMessageButton.jsx). If this number hasn't
//    written in the last 24 hours, WhatsApp only accepts a pre-approved
//    template, so it goes out as the first-contact template (same as
//    app/api/clients/[id]/messages for a registered client).
// PATCH -> { client_id } links every message on this phone to that client,
//    folding this thread into their normal /messages/[id] page from then on.

import { ensureWhatsAppNumberOnFile } from '@/lib/whatsappNumberOnFile';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendWhatsAppText, sendFirstContactMessage } from '@/lib/metaWhatsapp';
import { whatsappDigits } from '@/lib/clientPhoneDigits';

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;
import { withoutDashes } from '@/lib/noDashes';
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
  // Inbound rows store the number as bare digits (971...), so a reply has
  // to use the same shape to land in the same thread.
  const phone = whatsappDigits(decodeURIComponent(params.phone));
  const body = await request.json().catch(() => ({}));
  const text = typeof body.body === 'string' ? withoutDashes(body.body.trim().slice(0, 2000)) : '';

  if (!text) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (!body.staff_id) {
    return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
  }

  if (!phone) {
    return NextResponse.json({ error: 'a valid phone number is required' }, { status: 400 });
  }

  const { data: lastInbound } = await supabaseAdmin
    .from('client_messages')
    .select('created_at')
    .eq('phone', phone)
    .eq('sender', 'client')
    .eq('channel', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const windowOpen = Boolean(lastInbound) && Date.now() - new Date(lastInbound.created_at).getTime() < WHATSAPP_WINDOW_MS;

  let waMessageId = null;
  try {
    waMessageId = windowOpen
      ? await sendWhatsAppText(phone, text)
      : await sendFirstContactMessage(phone, { clientName: body.client_name || null, clientMessage: text });
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
  // Save the number on their file too, so their next WhatsApp message
  // matches them instead of showing up as unregistered again.
  await ensureWhatsAppNumberOnFile(body.client_id, phone);
  return NextResponse.json({ ok: true });
}
