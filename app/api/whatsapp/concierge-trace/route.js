// app/api/whatsapp/concierge-trace/route.js
// GET /api/whatsapp/concierge-trace?client_id=X (or ?phone=X)
//   -> runs the AI concierge (lib/whatsappConcierge.js) against a client's
//      REAL current conversation history exactly as the webhook would,
//      but as a true dry run: nothing is sent over WhatsApp, nothing is
//      logged to client_messages, and book_consult is stubbed out so no
//      real appointment can be created (see runTool's dryRun check).
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let clientId = searchParams.get('client_id');
  const phone = searchParams.get('phone');

  if (!clientId && phone) {
    const matches = await clientIdsWithPhoneLike(supabase, phone);
    clientId = matches[0] || null;
    if (!clientId) {
      return NextResponse.json({ error: `No client found matching phone "${phone}"` }, { status: 404 });
    }
  }

  if (!clientId) {
    return NextResponse.json({ error: 'client_id or phone is required' }, { status: 400 });
  }

  const result = await maybeRunConcierge({ clientId, phone: phone || '', dryRun: true });
  return NextResponse.json(result);
}
