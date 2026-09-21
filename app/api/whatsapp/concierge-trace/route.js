// app/api/whatsapp/concierge-trace/route.js
//
// GET /api/whatsapp/concierge-trace?client_id=X (or ?phone=X, or ?name=X —
// the easiest of the three, a plain substring match against full_name)
//   -> runs the AI concierge (lib/whatsappConcierge.js) against a client's
//      REAL current conversation history exactly as the webhook would,
//      but as a true dry run: nothing is sent over WhatsApp, nothing is
//      logged to client_messages, and book_consult is stubbed out so no
//      real appointment can be created (see runTool's dryRun check).
//      Replays against the last real CLIENT message, trimming off any of
//      the concierge's own later replies — otherwise there's usually
//      nothing new to "respond to" as-is, since its own last reply is
//      typically the newest row.
//
// Built after several rounds of prompt/logic fixes to the concierge each
// looked right in code but didn't visibly fix a live symptom (it kept
// insisting a date had no availability when it genuinely did) — without
// this, the only way to know what the model actually did on a given turn
// was to infer it from a WhatsApp screenshot after the fact. This
// exposes the real, ground-truth trace instead: every round, exactly
// which tool(s) were called with what input, what they returned, any
// text produced, and whether the safeguards in maybeRunConcierge
// rejected it — reused for any future concierge debugging, not just this
// one incident.
//
// Staff-gated like any other non-public route (not in middleware.js's
// PUBLIC_PATTERNS).

import { supabase } from '@/lib/supabaseClient';
import { clientIdsWithPhoneLike } from '@/lib/phoneMatch';
import { maybeRunConcierge } from '@/lib/whatsappConcierge';
import { NextResponse } from 'next/server';

// Same lesson as GET /api/clients/:id/messages (see that route's comment):
// a plain GET route with no explicit no-store header can get cached by a
// browser and keep showing an old result — including a stale "no client
// message to respond to" from before the conversation had one — even
// past a hard reload. A debug tool needs to be trusted to always reflect
// live state.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let clientId = searchParams.get('client_id');
  const phone = searchParams.get('phone');
  const name = searchParams.get('name');

  if (!clientId && phone) {
    const matches = await clientIdsWithPhoneLike(supabase, phone);
    clientId = matches[0] || null;
    if (!clientId) {
      return NextResponse.json({ error: `No client found matching phone "${phone}"` }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  if (!clientId && name) {
    const { data: clients, error } = await supabase.from('clients').select('id, full_name').ilike('full_name', `%${name}%`).limit(5);
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    if (!clients?.length) {
      return NextResponse.json({ error: `No client found matching name "${name}"` }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    if (clients.length > 1) {
      return NextResponse.json(
        { error: `Multiple clients match "${name}" — be more specific`, matches: clients },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    clientId = clients[0].id;
  }

  if (!clientId) {
    return NextResponse.json({ error: 'client_id, phone, or name is required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const result = await maybeRunConcierge({ clientId, phone: phone || '', dryRun: true, replayLastClientMessage: true });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
