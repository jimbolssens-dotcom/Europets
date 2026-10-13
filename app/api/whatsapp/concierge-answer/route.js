// app/api/whatsapp/concierge-answer/route.js
//
// POST { client_id } -> staff pressed "AI answer" on a WhatsApp thread:
//   runs the AI concierge (lib/whatsappConcierge.js) on the client's latest
//   message for real, even though staff replied recently or the thread was
//   handed over, and sends its reply on WhatsApp. For when the concierge
//   played safe on something it can handle (a "Book Appointment" tap after
//   an unrelated billing question, 13 Oct). The thread's flag and saved
//   escalation reason are cleared once it has answered.
//
//   If the AI still won't answer (a symptom, a medical question), nothing
//   is sent to the client and its reason comes back for staff to read.
//
// Staff-gated like any other non-public route (not in middleware.js's
// PUBLIC_PATTERNS).

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { maybeRunConcierge, sendConciergeReply, isWhatsAppAiEnabled } from '@/lib/whatsappConcierge';
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

  const result = await maybeRunConcierge({ clientId, phone, force: true, replayLastClientMessage: true });

  if (result.sent) {
    try {
      await sendConciergeReply({ clientId, phone, reply: result.reply });
    } catch (err) {
      return NextResponse.json({ error: `The AI wrote a reply but WhatsApp didn't send it: ${err.message}` }, { status: 502 });
    }
    await supabaseAdmin
      .from('client_message_thread_state')
      .upsert(
        [{ thread_key: clientId, flagged: false, escalation_reason: null, escalated_at: null, last_read_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
        { onConflict: 'thread_key' }
      );
    return NextResponse.json({ sent: true, reply: result.reply });
  }

  return NextResponse.json({
    sent: false,
    escalated: Boolean(result.escalated),
    reason: result.reason || 'The AI did not produce a reply',
  });
}
