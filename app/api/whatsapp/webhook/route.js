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
import { sendFallbackEmailForFailedWhatsApp } from '@/lib/emailFallback';
import { clientIdsWithPhoneLike } from '@/lib/phoneMatch';
import { downloadWhatsAppMedia } from '@/lib/metaWhatsapp';
import { staffForPhone, quotedTeamGroup, postFromWhatsApp } from '@/lib/teamWhatsapp';
import { startsWithTeamTag } from '@/lib/teamChatPlan';
import { maybeRunConcierge, applyConciergeDecision, isWhatsAppAiEnabled } from '@/lib/whatsappConcierge';
import { isAssistantOwnerPhone, relayToAssistant } from '@/lib/personalAssistantRelay';
import { transcribeVoiceNote } from '@/lib/assemblyai';
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

// A text message's body, an image/document's caption (may be empty —
// the file itself is handled separately, see downloadInboundMedia), or
// a short bracketed placeholder for any other message type Meta might
// deliver (location, a reaction, ...). There's no "open WhatsApp
// instead" fallback for those — this number can only ever be used
// through this app, never the regular WhatsApp client — so v1 just says
// plainly that type isn't viewable here yet rather than pointing staff
// somewhere that doesn't exist for this number.
function extractBody(message) {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'image') return message.image?.caption || '';
  if (message.type === 'document') return message.document?.caption || '';
  if (message.type === 'video') return message.video?.caption || '';
  if (message.type === 'sticker' || message.type === 'audio') return '';
  if (message.type === 'button') return message.button?.text || '[button reply]';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[interactive reply]';
  }
  // WhatsApp's own "share contact" card — no media download involved,
  // its name(s)/phone(s) arrive as plain data right on the message, so
  // this just formats them into something readable rather than
  // treating it like an unsupported type.
  if (message.type === 'contacts') {
    const shared = (message.contacts || []).map((c) => {
      const name = c.name?.formatted_name || 'Unknown';
      const phone = c.phones?.[0]?.phone;
      return phone ? `${name} (${phone})` : name;
    });
    return shared.length ? `📇 Shared contact: ${shared.join(', ')}` : '📇 Shared a contact';
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

// Meta's per-type media object always carries the same { id, ... } shape
// regardless of which of these it is — this just says which field to
// read it off of, and what media_type to tag the stored row with so the
// thread views (app/(admin)/messages/[id], app/mobile/messages/[id])
// know whether to render an image, an <audio> player, or a plain
// download link (the same 'file' type a staff-sent PDF already uses).
const INBOUND_MEDIA_TYPES = {
  image: { field: 'image', mediaType: 'image' },
  sticker: { field: 'sticker', mediaType: 'image' },
  document: { field: 'document', mediaType: 'file' },
  audio: { field: 'audio', mediaType: 'audio' },
  // Played inline in the thread (<video>), like a voice note's <audio>.
  video: { field: 'video', mediaType: 'video' },
};

// Downloads a photo/sticker/document/voice-note a client sent and
// re-hosts it in the same "consult-files" Storage bucket every other
// photo/file in this app already lives in (see migrations/131) — Meta
// only keeps the original for a few days, so this has to happen right
// away, not on first view. Best-effort: a failure here (Meta media API
// hiccup, huge file, ...) shouldn't lose the rest of the message — it
// just falls back to no media, same as before this existed (and still
// leaves extractBody's caption/placeholder text on the row either way).
async function downloadInboundMedia(message) {
  const spec = INBOUND_MEDIA_TYPES[message.type];
  const media = spec && message[spec.field];
  if (!media?.id) return {};
  try {
    const { buffer, mimeType } = await downloadWhatsAppMedia(media.id);
    const ext =
      mimeType.split('/')[1]?.split(';')[0] || (spec.mediaType === 'file' ? 'bin' : spec.mediaType === 'video' ? 'mp4' : 'jpg');
    const path = `whatsapp/${message.id}.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('consult-files')
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabaseAdmin.storage.from('consult-files').getPublicUrl(path);
    return { media_url: data.publicUrl, media_type: spec.mediaType };
  } catch (err) {
    console.error('Failed to download/store inbound WhatsApp media', message.id, err);
    return {};
  }
}

// A client typing a quick "Hello" and then their real message a beat
// later arrives as two separate webhook deliveries — without this, the
// concierge answered the FIRST one alone, before the second had landed,
// and could end up asking something the client's very next message
// already answered (a real incident: it asked "how's Pepper doing?"
// right after the client's own following message already said "she's
// doing better, stitches healing well"). Waiting a short beat, then
// checking whether a NEWER client message has shown up in the meantime,
// lets a fast follow-up supersede an earlier trigger — only the LAST
// message in a burst of any length ever actually runs the concierge
// (every earlier one in the burst finds itself superseded and bails out
// silently), and that one sees the whole burst together in its history.
// Skipped entirely when the concierge is off.
const CONCIERGE_DEBOUNCE_MS = 2000;

// Whether the client has written again since this message (a client on
// file by client_id, an unknown number by its phone).
async function newerClientMessageSince(clientId, phone, waMessageId) {
  let q = supabase.from('client_messages').select('wa_message_id').eq('sender', 'client');
  q = clientId ? q.eq('client_id', clientId) : q.eq('phone', phone).is('client_id', null);
  const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  return Boolean(data && data.wa_message_id !== waMessageId);
}

// After a fresh inbound message is stored, the concierge (lib/whatsappConcierge.js)
// decides what to do with it: reply, hand to staff with its own message, or
// stay silent. Best-effort and isolated from the message-storage path above:
// any failure here is caught and logged, never allowed to turn an
// otherwise-successful webhook delivery into a failed one Meta would retry
// forever (and the 5-minute sweep picks up anything left undecided).
async function runConciergeForInbound(message, clientId, digits) {
  try {
    if (!isWhatsAppAiEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, CONCIERGE_DEBOUNCE_MS));
    if (await newerClientMessageSince(clientId, digits, message.id)) return;

    const decision = await maybeRunConcierge({ clientId, phone: digits });
    // The model can take several seconds, long past the debounce above: a
    // client who writes again meanwhile ("Can we move appointment to
    // Tuesday please", then "Something urgent came up on Monday") starts a
    // second run that sees both messages, and used to get two near-identical
    // replies, one from each run. The newer run answers for both, so this
    // one stays silent.
    if (await newerClientMessageSince(clientId, digits, message.id)) return;
    console.log('WhatsApp concierge', message.id, decision.action, decision.reason || '');
    await applyConciergeDecision(decision, { clientId, phone: digits });
  } catch (err) {
    console.error('WhatsApp AI concierge failed', message.id, err);
  }
}

// A staff member writing to the clinic number (migration 220): it's the
// team chat on their WhatsApp, so it goes into the group, never the client
// inbox or the concierge (lib/teamWhatsapp.js). Reactions are left out.
async function handleStaffInbound(message, staff) {
  if (message.type === 'reaction') return;
  const media = INBOUND_MEDIA_TYPES[message.type] ? await downloadInboundMedia(message) : {};
  const body = INBOUND_MEDIA_TYPES[message.type] && !extractBody(message) ? '' : extractBody(message);
  const result = await postFromWhatsApp(staff, message, { body, media }).catch((err) => ({ error: err.message }));
  if (result?.error) console.error('Failed to post a staff WhatsApp message to the team chat', message.id, result.error);
}

async function handleInboundMessage(message, contactPhone) {
  const digits = (contactPhone || message.from || '').replace(/\D/g, '');
  const staff = await staffForPhone(digits);

  // A staff member replying to a team chat copy (even from the owner's own
  // phone, whose other messages go to the assistant below).
  if (staff && (await quotedTeamGroup(message.context?.id))) {
    await handleStaffInbound(message, staff);
    return;
  }

  // The owner's own phone(s): hand off to the personal assistant and stop
  // here, before any lookup, media download, storage or concierge — so none
  // of it ever lands in the clinic's database, inbox or logs. See
  // lib/personalAssistantRelay.js.
  if (isAssistantOwnerPhone(digits)) {
    await relayToAssistant(message, digits);
    return;
  }

  const clientId = await findClientIdForPhone(digits);

  // A staff number goes to the team chat. One that's also a client's
  // (staff with their own pets, the owner testing) only when it's meant for
  // the team (a reply to a team message, above, or starting with a
  // #group), so their own client conversation keeps working.
  if (staff && (!clientId || startsWithTeamTag(extractBody(message)))) {
    await handleStaffInbound(message, staff);
    return;
  }

  const media = INBOUND_MEDIA_TYPES[message.type] ? await downloadInboundMedia(message) : {};

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

  // A voice note is transcribed first (migration 196): staff see the text
  // under the player, and the concierge reads it like a typed message.
  if (message.type === 'audio' && media.media_url) {
    const transcript = await transcribeVoiceNote(media.media_url);
    if (transcript) await supabaseAdmin.from('client_messages').update({ transcript }).eq('wa_message_id', message.id);
  }
  // Everything goes to the concierge, which decides what it needs: a photo
  // or file it can't see goes to staff with a message it writes, a reaction
  // usually needs nothing.
  await runConciergeForInbound(message, clientId, digits);
}

async function handleStatusUpdate(status) {
  // A 'failed' status carries a real reason in `errors` (see migration
  // 134) — most commonly Meta's "Re-engagement message" when a free-form
  // reply was sent outside the 24-hour window a client's own message
  // opens. Meta's own send API can accept the request and only report
  // this async, once delivery actually fails, so this is often the only
  // place that reason ever surfaces. Leads with the numeric error code
  // Meta always attaches (e.g. "#131047") — title/message alone can be
  // vague or unfamiliar-sounding prose; the code is the part that's
  // actually searchable against Meta's own error-code docs.
  const update = { status: status.status };
  if (status.status === 'failed' && status.errors?.[0]) {
    const err = status.errors[0];
    update.wa_error = [
      err.code != null ? `#${err.code}` : null,
      err.title || err.message || null,
      err.error_data?.details || null,
    ]
      .filter(Boolean)
      .join(' — ') || null;
  }
  const { error } = await supabaseAdmin.from('client_messages').update(update).eq('wa_message_id', status.id);
  // Or a team chat copy sent to a staff member (migration 220).
  await supabaseAdmin
    .from('team_deliveries')
    .update({ status: status.status, ...(update.wa_error ? { error: update.wa_error } : {}) })
    .eq('wa_message_id', status.id);
  if (error) {
    console.error('Failed to update WhatsApp message status', status.id, error);
  }
  // A reminder that never arrived goes out by email instead, if one was
  // kept for it (see migration 171 and lib/emailFallback.js).
  if (status.status === 'failed') {
    await sendFallbackEmailForFailedWhatsApp(status.id);
  }
}

// Room for a voice-note transcription plus the concierge's reply.
export const maxDuration = 60;

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
