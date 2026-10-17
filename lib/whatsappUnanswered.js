// lib/whatsappUnanswered.js
// Backstop for "nothing has responded to this WhatsApp message": see
// app/api/whatsapp/nudge-sweep, which calls sweepUnansweredWhatsAppThreads
// every 5 minutes (Vercel Cron).
//
// Every inbound message already goes to the concierge in real time
// (app/api/whatsapp/webhook), which replies, hands over with its own
// message, or stays silent, and marks the thread handled either way
// (applyConciergeDecision). So this only finds a client message nothing
// dealt with at all: a webhook that timed out, a concierge run that
// crashed before deciding. For those it simply runs the same concierge
// again, so the client gets the same judgment, not a separate set of
// fixed lines. whatsapp_threads_needing_nudge (the SQL function) returns
// threads whose newest real row is the client's, older than the cutoff,
// and not handled since.
//
// Gated on the same WHATSAPP_AI_ENABLED switch as the concierge itself.

import { supabase } from './supabaseClient';
import { isWhatsAppAiEnabled, maybeRunConcierge, applyConciergeDecision } from './whatsappConcierge';

const NUDGE_CUTOFF_MINUTES = 5;

// Each thread is handled independently and never throws out of the loop:
// one bad send or model hiccup shouldn't stop the rest of the sweep.
export async function sweepUnansweredWhatsAppThreads() {
  if (!isWhatsAppAiEnabled()) return { skipped: true, reason: 'WHATSAPP_AI_ENABLED is not set', results: [] };

  const { data: threads, error } = await supabase.rpc('whatsapp_threads_needing_nudge', {
    cutoff_minutes: NUDGE_CUTOFF_MINUTES,
  });
  if (error) return { skipped: true, reason: `lookup failed: ${error.message}`, results: [] };

  const results = [];
  for (const t of threads || []) {
    try {
      const decision = await maybeRunConcierge({ clientId: t.client_id, phone: t.phone });
      await applyConciergeDecision(decision, { clientId: t.client_id, phone: t.phone });
      results.push({ thread_key: t.thread_key, action: decision.action, reason: decision.reason || null });
    } catch (err) {
      console.error('Unanswered WhatsApp thread sweep failed for one thread', t.thread_key, err);
      results.push({ thread_key: t.thread_key, action: 'error', error: err.message });
    }
  }
  return { skipped: false, results };
}
