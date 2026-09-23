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
import { downloadWhatsAppMedia } from '@/lib/metaWhatsapp';
import { maybeRunConcierge, sendConciergeReply, sendEscalationNotice } from '@/lib/whatsappConcierge';
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

// A text message's body, an image's caption (may be empty — the photo
// itself is handled separately, see downloadInboundImage), or a short
// bracketed placeholder for any other message type Meta might deliver
// (voice note, document, location, a reaction, ...). There's no "open
// WhatsApp instead" fallback for those — this number can only ever be
// used through this app, never the regular WhatsApp client — so v1 just
// says plainly that type isn't viewable here yet rather than pointing
// staff somewhere that doesn't exist for this number.
function extractBody(message) {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'image') return message.image?.caption || '';
  if (message.type === 'sticker') return '';
  if (message.type === 'button') return message.button?.text || '[button reply]';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[interactive reply]';
  }
  // A tap-and-hold emoji reaction on one of our own messages, not a new
  // message of its own — Meta still delivers it as a full inbound message
  // (its own id, its own timestamp), just with no text/image, and
  // message.reaction.emoji empty means the client removed a reaction
  // rather than added one.
  if (message.type === 'reaction') {
    return message.reaction?.emoji ? `Reacted ${message.reaction.emoji}` : 'Removed a reaction';
  }
  return `[${message.type || 'unsupported'} message — not viewable here yet]`;
}

async function findClientIdForPhone(digits) {
  if (!digits) return null;
  const matches = await clientIdsWithPhoneLike(supabase, digits);
  return matches[0] || null;
}

// Downloads a photo/sticker a client sent and re-hosts it in the same
// "consult-files" Storage bucket every other photo/file in this app
// already lives in (see migrations/131) — Meta only keeps the original
// for a few days, so this has to happen right away, not on first view.
// Best-effort: a failure here (Meta media API hiccup, huge file, ...)
// shouldn't lose the rest of the message — it just falls back to no
// photo, same as before this existed.
async function downloadInboundImage(message) {
  const media = message.image || message.sticker;
  if (!media?.id) return {};
  try {
    const { buffer, mimeType } = await downloadWhatsAppMedia(media.id);
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpg';
    const path = `whatsapp/${message.id}.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('consult-files')
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabaseAdmin.storage.from('consult-files').getPublicUrl(path);
    return { media_url: data.publicUrl, media_type: 'image' };
  } catch (err) {
    console.error('Failed to download/store inbound WhatsApp image', message.id, err);
    return {};
  }
}

// After a fresh inbound message is stored, gives the AI concierge (see
// lib/whatsappConcierge.js) a chance to answer it directly — gated by
// WHATSAPP_AI_ENABLED and only for a message matched to a client, both
// checked inside maybeRunConcierge. Best-effort and isolated from the
// message-storage path above: any failure here (a bad model response, a
// send failure, a bug) is caught and logged, never allowed to turn an
// otherwise-successful webhook delivery into a failed one Meta would
// retry forever.
async function runConciergeForInbound(message, clientId, digits) {
  try {
    const result = await maybeRunConcierge({ clientId, phone: digits });
    if (result.sent) {
      await sendConciergeReply({ clientId, phone: digits, reply: result.reply });
    } else if (result.escalated) {
      console.log('WhatsApp AI concierge escalated to staff', message.id, result.reason);
      await sendEscalationNotice(digits);
    }
  } catch (err) {
    console.error('WhatsApp AI concierge failed', message.id, err);
  }
}

async function handleInboundMessage(message, contactPhone) {
  const digits = (contactPhone || message.from || '').replace(/\D/g, '');
  const clientId = await findClientIdForPhone(digits);
  const media =
    message.type === 'image' || message.type === 'sticker' ? await downloadInboundImage(message) : {};

  const { error } = await supabaseAdmin.from('client_messages').insert([
    {
      client_id: clientId,
      phone: digits,
      channel: 'whatsapp',
      sender: 'client',
      body: extractBody(message),
      wa_message_id: message.id,
      ...media,
    },
  ]);
  // Duplicate delivery of the same message (Meta retries on a slow 200) is
  // a no-op thanks to wa_message_id's unique constraint — anything else is
  // worth knowing about, but shouldn't turn into a failed webhook response
  // (Meta interprets a non-2xx as "retry this delivery forever").
  if (error) {
    if (error.code !== '23505') {
      console.error('Failed to store inbound WhatsApp message', message.id, error);
    }
    return;
  }

  // A plain-text message or a tapped template button/quick-reply (its text
  // arrives exactly like typing it — see extractBody above) both go to the
  // concierge; anything else (a photo of an injury, a receipt, ...) always
  // needs a human's eyes.
  if (message.type === 'text' || message.type === 'button' || message.type === 'interactive') {
    await runConciergeForInbound(message, clientId, digits);
  }
}

async function handleStatusUpdate(status) {
  // A 'failed' status carries a real reason in `errors` (see migration
  // 134) — most commonly Meta's "Re-engagement message" when a free-form
  // reply was sent outside the 24-hour window a client's own message
  // opens. Meta's own send API can accept the request and only report
  // this async, once delivery actually fails, so this is often the only
  // place that reason ever surfaces.
  const update = { status: status.status };
  if (status.status === 'failed' && status.errors?.[0]) {
    update.wa_error = status.errors[0].title || status.errors[0].message || null;
  }
  const { error } = await supabaseAdmin.from('client_messages').update(update).eq('wa_message_id', status.id);
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
