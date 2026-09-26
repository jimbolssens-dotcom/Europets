// app/api/clients/[id]/messages/route.js
// DELETE /api/clients/:id/messages?message_id=X -> removes one FAILED
//      message from the thread (see the handler below for why it's
//      scoped that way).
// GET  /api/clients/:id/messages  -> the full two-way chat thread for this
//      client (both 'client' and 'staff' rows, oldest first, app and
//      WhatsApp channels both — see migrations/130). Used by both the
//      client app's own chat page and the staff inbox thread view.
// POST /api/clients/:id/messages  -> staff's reply
//      ({ body, staff_id, channel?, media_url?, media_type?, media_name? }).
//      channel defaults to 'app' (an ordinary client-app chat row, exactly
//      as before); 'whatsapp' also sends it live via the WhatsApp Cloud API
//      to this client's own phone number (clients.phone — see migrations/
//      055) before logging it, and fails the request if that send fails
//      rather than logging a reply that was never actually delivered. A
//      photo or file (see lib/attachments.js's uploadClientMessageMedia,
//      already uploaded to Storage client-side before this is called)
//      sends as WhatsApp media instead of text when media_url is set,
//      with body used as its caption if present.
//
//      A free-form WhatsApp send only works within the 24-hour window the
//      client's own last WhatsApp message opened — outside it (most
//      commonly: this is the first time anyone's messaging them on this
//      number at all), a plain reply can get accepted by Meta's API and
//      then silently fail delivery moments later. So a text-only send
//      first checks whether that window is actually open (hasOpenWhatsAppWindow
//      below) and falls back to sendFirstContactMessage's pre-approved
//      template when it isn't — media has no such fallback (Meta templates
//      can't carry arbitrary media), so that combination is refused
//      outright with an explicit error instead of risking the same silent
//      failure. The client's own side of
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
import { sendWhatsAppText, sendWhatsAppMedia, sendFirstContactMessage } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';

export const dynamic = 'force-dynamic';

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

async function hasOpenWhatsAppWindow(clientId) {
  const { data } = await supabase
    .from('client_messages')
    .select('created_at')
    .eq('client_id', clientId)
    .eq('sender', 'client')
    .eq('channel', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  return Date.now() - new Date(data.created_at).getTime() < WHATSAPP_WINDOW_MS;
}

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
  // `dynamic = 'force-dynamic'` above only stops Next's own server-side
  // caching — without an explicit no-store header, a browser can still
  // cache this GET response itself, which is exactly what live testing
  // showed: a thread stuck showing an old handful of messages even
  // through a hard page reload, with the same URL returning the full,
  // correct list when hit fresh. This is the one route that most needs
  // never to look stale — it's the live WhatsApp/app chat thread.
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 2000) : '';
  const mediaUrl = typeof body.media_url === 'string' ? body.media_url : null;
  const mediaType = typeof body.media_type === 'string' ? body.media_type : null; // 'image' | 'file'
  const mediaName = typeof body.media_name === 'string' ? body.media_name : null;
  const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'app';

  if (!text && !mediaUrl) {
    return NextResponse.json({ error: 'body or media_url is required' }, { status: 400 });
  }
  if (!body.staff_id) {
    return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
  }

  // body stays required not-null at the DB level (migration 120) — an
  // image/file with no caption is stored as '', same as an inbound
  // WhatsApp photo with no caption already is (see the webhook).
  const row = { client_id: params.id, sender: 'staff', staff_id: body.staff_id, body: text, channel };
  if (mediaUrl) {
    row.media_url = mediaUrl;
    row.media_type = mediaType || 'file';
  }

  if (channel === 'whatsapp') {
    const { data: client } = await supabase
      .from('clients')
      .select('full_name, phone')
      .eq('id', params.id)
      .maybeSingle();
    const digits = (client?.phone || '').replace(/\D/g, '');
    if (!digits) {
      return NextResponse.json(
        { error: 'This client has no phone number on file to send a WhatsApp reply to' },
        { status: 400 }
      );
    }

    const windowOpen = await hasOpenWhatsAppWindow(params.id);
    if (mediaUrl && !windowOpen) {
      return NextResponse.json(
        {
          error:
            "This client has no open WhatsApp conversation (they haven't messaged this number in the last 24 hours) — a photo or file can only be sent as a free-form reply within that window. Send a text message instead, which will use the first-contact template.",
        },
        { status: 409 }
      );
    }

    try {
      if (mediaUrl) {
        row.wa_message_id = await sendWhatsAppMedia(digits, {
          url: mediaUrl,
          contentType: mediaType === 'image' ? 'image/*' : 'application/octet-stream',
          caption: text || undefined,
          filename: mediaName,
        });
      } else if (windowOpen) {
        row.wa_message_id = await sendWhatsAppText(digits, text);
      } else {
        row.wa_message_id = await sendFirstContactMessage(digits, { clientName: client?.full_name, clientMessage: text });
      }
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

// DELETE /api/clients/:id/messages?message_id=X -> removes one message row
// from this thread. Scoped to status='failed' only (a message Meta's API
// accepted but never actually delivered, per the async status webhook) —
// staff can clear these out of a thread since they were never real
// history, but this deliberately can't touch a sent/delivered/read message:
// there's no way to un-send something a client may have actually received,
// so real conversation history always stays intact.
export async function DELETE(request, { params }) {
  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get('message_id');
  if (!messageId) {
    return NextResponse.json({ error: 'message_id is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('client_messages')
    .delete()
    .eq('id', messageId)
    .eq('client_id', params.id)
    .eq('status', 'failed')
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No matching failed message found to remove' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
