// lib/whatsappUnanswered.js
// Universal backstop for "nobody's replied to this WhatsApp message in
// time" — see app/api/whatsapp/nudge-sweep, which calls
// sweepUnansweredWhatsAppThreads on a schedule (Vercel Cron), unlike the
// concierge (lib/whatsappConcierge.js) which reacts per-message in real
// time.
//
// The concierge already answers, escalates, or hands off within seconds
// for anything it's eligible to see at all. This sweep exists for the
// cases that never reach it, and would otherwise sit silent forever:
//   - a WhatsApp number that isn't matched to any client (maybeRunConcierge
//     bails out immediately — no clientId to work from)
//   - a photo/voice note/document (never routed to the concierge — always
//     needs a human's eyes, see handleInboundMessage in the webhook)
//   - WHATSAPP_AI_ENABLED turned off entirely
//   - a rare concierge failure (a model error, an empty reply)
//
// One split matters here that the real-time paths never had to make: the
// client's last message might be a pure conversational closer — "thanks",
// "ok", a 👍, "bye" — that genuinely doesn't need a "someone will follow
// up" notice; sending one anyway would read as ignoring what they said.
// Those get a short, warm closing line instead — logged and sent exactly
// like a normal resolved reply, never flagged for staff, since there's
// nothing left for a human to do. A reaction emoji needs neither: nothing
// is sent, nothing is flagged, it's just marked handled. Everything else —
// media, or a real question/request past the cutoff — gets a notice AND a
// flag, same as an AI escalation.
//
// Gated on the same WHATSAPP_AI_ENABLED switch as the concierge itself —
// one kill switch for every piece of AI-driven WhatsApp behavior, not two
// to remember.

import { anthropic } from './anthropicClient';
import { supabase } from './supabaseClient';
import { supabaseAdmin } from './supabaseAdmin';
import { sendWhatsAppText } from './metaWhatsapp';
import { withoutDashes } from './noDashes';
import { isWhatsAppAiEnabled, flagEscalatedThread, sendEscalationFollowUpNotice } from './whatsappConcierge';

const NUDGE_CUTOFF_MINUTES = 5;
const MODEL = 'claude-opus-5';

// A tap-and-hold emoji reaction (see extractBody in the webhook) is never
// worth nudging over either way — there's nothing to answer and nothing
// for staff to look at.
function isBareReaction(body) {
  return body === 'Removed a reaction' || /^Reacted /.test(body || '');
}

// One small model call decides whether this is a pure closer or something
// that actually needs a reply — a plain keyword list would miss this
// easily, since clients write in whatever language they like and "ok
// thanks 👍" takes endless shapes. Deliberately separate from the full
// concierge (no tools, no client/pet context): this is a narrow yes/no
// call, not an attempt to actually handle the message.
async function classify(body) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `A veterinary clinic client sent this WhatsApp message and hasn't heard back from the clinic yet:\n\n"${body}"\n\nIs this a pure conversational closer — a thank-you, an "ok", a goodbye, a thumbs-up-style acknowledgment — that genuinely needs no further reply from the clinic? Or does it ask a question, share information, or otherwise call for a reply?\n\nIf it's a pure closer, respond with EXACTLY:\nCLOSING: <a short, warm one-line reply in the same language as their message, with no long dashes (— or –)>\n\nOtherwise respond with EXACTLY:\nNEEDS_REPLY`,
      },
    ],
  });
  const text = (response.content.find((b) => b.type === 'text')?.text || '').trim();
  if (text.startsWith('CLOSING:')) {
    return { closing: true, reply: text.slice('CLOSING:'.length).trim() || "You're welcome!" };
  }
  return { closing: false };
}

async function sendMediaWaitingNotice(phone) {
  try {
    await sendWhatsAppText(phone, "Thanks for sending that over. One of our team will take a look and get back to you shortly.");
  } catch (err) {
    console.error('Failed to send WhatsApp media-waiting notice', phone, err);
  }
}

// A closing reply fully resolves the message (no human follow-up
// expected), so unlike the escalation/handoff notices it's logged as a
// normal 'ai' reply — same as sendConciergeReply — which also correctly
// flips the thread's derived "pending" flag back off.
async function sendAndLogClosingReply(clientId, phone, rawBody) {
  const body = withoutDashes(rawBody);
  const waMessageId = await sendWhatsAppText(phone, body);
  const { error } = await supabaseAdmin.from('client_messages').insert([
    { client_id: clientId, phone, channel: 'whatsapp', sender: 'ai', body, wa_message_id: waMessageId, status: 'sent' },
  ]);
  if (error) console.error('Failed to log AI closing reply', clientId, phone, error);
}

async function markNudged(threadKey) {
  const { error } = await supabaseAdmin
    .from('client_message_thread_state')
    .upsert([{ thread_key: threadKey, nudge_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }], { onConflict: 'thread_key' });
  if (error) console.error('Failed to mark WhatsApp thread as nudged', threadKey, error);
}

// Called from the cron route. Each thread is handled independently and
// never throws out of the loop — one bad WhatsApp send or model hiccup
// shouldn't stop the rest of the sweep, the same reasoning as every other
// best-effort notification path in this app.
export async function sweepUnansweredWhatsAppThreads() {
  if (!isWhatsAppAiEnabled()) return { skipped: true, reason: 'WHATSAPP_AI_ENABLED is not set', results: [] };

  const { data: threads, error } = await supabase.rpc('whatsapp_threads_needing_nudge', {
    cutoff_minutes: NUDGE_CUTOFF_MINUTES,
  });
  if (error) return { skipped: true, reason: `lookup failed: ${error.message}`, results: [] };

  const results = [];
  for (const t of threads || []) {
    try {
      if (isBareReaction(t.body)) {
        await markNudged(t.thread_key);
        results.push({ thread_key: t.thread_key, action: 'reaction_ignored' });
        continue;
      }

      if (t.media_type) {
        await sendMediaWaitingNotice(t.phone);
        await flagEscalatedThread(t.thread_key);
        await markNudged(t.thread_key);
        results.push({ thread_key: t.thread_key, action: 'media_notice' });
        continue;
      }

      const { closing, reply } = await classify(t.body || '');
      if (closing) {
        await sendAndLogClosingReply(t.client_id, t.phone, reply);
        await markNudged(t.thread_key);
        results.push({ thread_key: t.thread_key, action: 'closing_reply', reply });
      } else {
        await sendEscalationFollowUpNotice(t.phone);
        await flagEscalatedThread(t.thread_key);
        await markNudged(t.thread_key);
        results.push({ thread_key: t.thread_key, action: 'needs_reply_notice' });
      }
    } catch (err) {
      console.error('Unanswered WhatsApp thread sweep failed for one thread', t.thread_key, err);
      results.push({ thread_key: t.thread_key, action: 'error', error: err.message });
    }
  }
  return { skipped: false, results };
}
