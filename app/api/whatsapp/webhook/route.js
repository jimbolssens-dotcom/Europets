// app/api/whatsapp/webhook/route.js
// GET  -> Meta's one-time verification handshake when you set this URL as
//         the webhook in Meta App Dashboard > WhatsApp > Configuration.
//         Must echo back hub.challenge if hub.verify_token matches
//         META_WHATSAPP_WEBHOOK_VERIFY_TOKEN (a secret you pick yourself,
//         entered in both places).
// POST -> Meta's actual event delivery: inbound messages and outbound
//         delivery-status updates, folded into the same client_messages
//         table the client app's own chat uses (see migrations/130) so
//         staff read/reply to both from one inbox (app/(admin)/messages).
//
// Public — Meta can't carry a staff PIN cookie, so this has to be in
// middleware.js's PUBLIC_PATTERNS. That means anyone can POST here, so
// every POST is verified against Meta's X-Hub-Signature-256 header (an
// HMAC-SHA256 of the raw body, keyed with META_WHATSAPP_APP_SECRET) before
// any of it is trusted — a request that doesn't match is dropped outright.

import { createHmac, timingSafeEqual } from 'crypto';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { clientIdsWithPhoneLike } from '@/lib/phoneMatch';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expected = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected) {
    return new NextResponse(challenge || '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

function isValidSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const expectedBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== gotBuf.length) return false;
  return timingSafeEqual(expectedBuf, gotBuf);
}

// A text message's body, or a short bracketed placeholder for any other
// message type Meta might deliver (image, voice note, document, location,
// a reaction, ...) — v1 logs that something arrived and lets staff open
// WhatsApp itself for the rare non-text message, rather than silently
// dropping it or blocking on building a viewer for every media type.
function extractBody(message) {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '[button reply]';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[interactive reply]';
  }
  return `[${message.type || 'unsupported'} message — open WhatsApp to view]`;
}

async function findClientIdForPhone(digits) {
  if (!digits) return null;
  const matches = await clientIdsWithPhoneLike(supabase, digits);
  return matches[0] || null;
}

async function handleInboundMessage(message, contactPhone) {
  const digits = (contactPhone || message.from || '').replace(/\D/g, '');
  const clientId = await findClientIdForPhone(digits);

  const { error } = await supabaseAdmin.from('client_messages').insert([
    {
      client_id: clientId,
      phone: digits,
      channel: 'whatsapp',
      sender: 'client',
      body: extractBody(message),
      wa_message_id: message.id,
    },
  ]);
  // Duplicate delivery of the same message (Meta retries on a slow 200) is
  // a no-op thanks to wa_message_id's unique constraint — anything else is
  // worth knowing about, but shouldn't turn into a failed webhook response
  // (Meta interprets a non-2xx as "retry this delivery forever").
  if (error && error.code !== '23505') {
    console.error('Failed to store inbound WhatsApp message', message.id, error);
  }
}

async function handleStatusUpdate(status) {
  const { error } = await supabaseAdmin
    .from('client_messages')
    .update({ status: status.status })
    .eq('wa_message_id', status.id);
  if (error) {
    console.error('Failed to update WhatsApp message status', status.id, error);
  }
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!isValidSignature(rawBody, signature)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const changes = (payload.entry || []).flatMap((entry) => entry.changes || []);

  for (const change of changes) {
    const value = change.value || {};
    const contactPhone = value.contacts?.[0]?.wa_id;
    for (const message of value.messages || []) {
      await handleInboundMessage(message, contactPhone);
    }
    for (const status of value.statuses || []) {
      // Meta reports every hop (sent -> delivered -> read); only bother
      // persisting the ones a human glancing at the inbox would care about.
      if (['delivered', 'read', 'failed'].includes(status.status)) {
        await handleStatusUpdate(status);
      }
    }
  }

  // Meta requires a 200 within a few seconds or it treats the delivery as
  // failed and retries — always ack once the payload's been processed,
  // even if an individual message above logged an error rather than throw.
  return NextResponse.json({ received: true });
}
