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
import { decideSweepAction } from './whatsappSweepDecision';
import { isWhatsAppAiEnabled, flagEscalatedThread, sendEscalationFollowUpNotice, sendAndLogNotice, threadHandedOver, clientStillNeedsStaff } from './whatsappConcierge';

const NUDGE_CUTOFF_MINUTES = 5;
const MODEL = 'claude-opus-5';


// One small model call decides whether this is a pure closer or something
// that actually needs a reply — a plain keyword list would miss this
// easily, since clients write in whatever language they like and "ok
// thanks 👍" takes endless shapes. Deliberately separate from the full
// concierge (no tools, no client/pet context): this is a narrow yes/no
// call, not an attempt to actually handle the message.
async function classify(messages) {
  const listed = messages.map((m) => `- "${m}"`).join('\n');
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `A veterinary clinic client sent these WhatsApp messages (oldest first) and hasn't heard back from the clinic since:\n\n${listed}\n\nTaken together, are they purely a conversational closer: a thank-you, an "ok", a goodbye, a thumbs-up-style acknowledgment, that genuinely needs no further reply from the clinic? If ANY of them asks a question, shares information, sends a voice note or photo, or otherwise calls for a reply, they need a reply, even if the last one is just "thanks".\n\nIf they're purely a closer, respond with EXACTLY:\nCLOSING: <a short, warm one-line reply in the same language as their messages, with no long dashes (— or –)>\n\nOtherwise respond with EXACTLY:\nNEEDS_REPLY`,
      },
    ],
  });
  const text = (response.content.find((b) => b.type === 'text')?.text || '').trim();
  if (text.startsWith('CLOSING:')) {
    return { closing: true, reply: text.slice('CLOSING:'.length).trim() || "You're welcome!" };
  }
  return { closing: false };
}

// The thread's recent rows, oldest first: by client, or for an unmatched
// number by its phone (the same split as the thread key).
async function threadRows(t) {
  let query = supabaseAdmin
    .from('client_messages')
    .select('sender, body, media_type, transcript, is_notice, created_at')
    .order('created_at', { ascending: false })
    .limit(40);
  query = t.client_id ? query.eq('client_id', t.client_id) : query.eq('phone', t.phone).is('client_id', null);
  const { data } = await query;
  return (data || []).reverse();
}


async function sendMediaWaitingNotice(phone, clientId) {
  try {
    await sendAndLogNotice(phone, "Thanks for sending that, a member of our team will take a look and be with you shortly.", clientId);
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
      const rows = await threadRows(t);
      const decision = decideSweepAction(rows, await threadHandedOver(t.thread_key, rows));
      if (decision.action === 'already_answered' || decision.action === 'nothing' || decision.action === 'reaction_ignored') {
        await markNudged(t.thread_key);
        if (decision.action !== 'nothing') results.push({ thread_key: t.thread_key, action: decision.action });
        continue;
      }

      // Already handed to staff and nobody has replied: no AI answer and no
      // closer, just the short "still with our team" line, keeping the
      // reason it was first handed over for.
      if (decision.action === 'with_staff_notice') {
        // Only an actual open question or request gets the line; a thank-you
        // or an ok to staff needs nothing.
        const judged = await clientStillNeedsStaff(rows);
        if (!judged.needsStaff) {
          await markNudged(t.thread_key);
          results.push({ thread_key: t.thread_key, action: 'nothing_for_staff', reason: judged.reason });
          continue;
        }
        await sendEscalationFollowUpNotice(t.phone, t.client_id);
        await markNudged(t.thread_key);
        results.push({ thread_key: t.thread_key, action: 'with_staff_notice' });
        continue;
      }

      if (decision.action === 'media_notice') {
        await sendMediaWaitingNotice(t.phone, t.client_id);
        await flagEscalatedThread(t.thread_key, 'Client sent a photo, file or voice note, a person needs to look at it');
        await markNudged(t.thread_key);
        results.push({ thread_key: t.thread_key, action: 'media_notice' });
        continue;
      }

      const { closing, reply } = await classify(decision.texts);
      if (closing) {
        await sendAndLogClosingReply(t.client_id, t.phone, reply);
        await markNudged(t.thread_key);
        results.push({ thread_key: t.thread_key, action: 'closing_reply', reply });
      } else {
        await sendEscalationFollowUpNotice(t.phone, t.client_id);
        await flagEscalatedThread(t.thread_key, 'Client message still unanswered');
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
