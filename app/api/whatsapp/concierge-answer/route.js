// app/api/whatsapp/concierge-answer/route.js
//
// POST { client_id } -> staff pressed "🤖 AI take over" on a WhatsApp
//   thread (migration 197). The AI takes the conversation over: the flag
//   and escalation reason are cleared and ai_takeover_at is set, so the
//   concierge answers every client message from now on, staff recently in
//   the thread or not, until a member of staff writes again or the AI
//   hands it back (escalate_to_staff).
//   - If the client's message is the latest one (they're waiting), the AI
//     answers it right away and its reply is sent on WhatsApp.
//   - If staff (or the AI) wrote last, nothing is sent now: the AI simply
//     picks up from the client's next message.
//   If the AI decides the waiting message needs a person after all (a
//   symptom, a medical question), the thread is handed back with its reason
//   and the client gets the usual "a member of our team" notice.
//
// Staff-gated like any other non-public route (not in middleware.js's
// PUBLIC_PATTERNS).

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { maybeRunConcierge, sendConciergeReply, isWhatsAppAiEnabled, flagEscalatedThread, sendEscalationNotice } from '@/lib/whatsappConcierge';
import { whatsappDigits } from '@/lib/clientPhoneDigits';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const clientId = body.client_id;
  if (!clientId) return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  if (!isWhatsAppAiEnabled()) return NextResponse.json({ error: 'The WhatsApp AI concierge is switched off' }, { status: 409 });

  // Reply to the number the client last wrote from; the client file's
  // number otherwise.
  const [{ data: lastInbound }, { data: client }] = await Promise.all([
    supabase
      .from('client_messages')
      .select('phone')
      .eq('client_id', clientId)
      .eq('sender', 'client')
      .eq('channel', 'whatsapp')
      .not('phone', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('clients').select('phone').eq('id', clientId).maybeSingle(),
  ]);
  const phone = whatsappDigits(lastInbound?.phone || client?.phone || '');
  if (!phone) return NextResponse.json({ error: 'No WhatsApp number for this client' }, { status: 400 });

  const now = new Date().toISOString();
  const { error: takeoverError } = await supabaseAdmin
    .from('client_message_thread_state')
    .upsert(
      [{ thread_key: clientId, flagged: false, escalation_reason: null, escalated_at: null, ai_takeover_at: now, last_read_at: now, updated_at: now }],
      { onConflict: 'thread_key' }
    );
  if (takeoverError) return NextResponse.json({ error: `Could not hand the conversation to the AI: ${takeoverError.message}` }, { status: 500 });

  // Is the client waiting? Their message is the newest real row (an
  // automatic notice doesn't count as an answer).
  const { data: latest } = await supabase
    .from('client_messages')
    .select('sender, is_notice')
    .eq('client_id', clientId)
    .eq('is_notice', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest?.sender !== 'client') {
    return NextResponse.json({ takeover: true, waiting: true });
  }

  const result = await maybeRunConcierge({ clientId, phone, force: true, replayLastClientMessage: true });

  if (result.sent) {
    try {
      await sendConciergeReply({ clientId, phone, reply: result.reply });
    } catch (err) {
      return NextResponse.json({ error: `The AI wrote a reply but WhatsApp didn't send it: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json({ takeover: true, sent: true, reply: result.reply });
  }

  // It needs a person after all: hand it straight back.
  const reason = result.reason || 'The AI did not produce a reply';
  await flagEscalatedThread(clientId, reason);
  if (result.escalated) await sendEscalationNotice(phone, clientId);
  return NextResponse.json({ takeover: false, sent: false, escalated: Boolean(result.escalated), reason });
}
