// app/api/whatsapp/concierge-replay/route.js
//
// GET /api/whatsapp/concierge-replay                       -> the cases (lib/conciergeReplayCases.js)
// GET /api/whatsapp/concierge-replay?case=N                -> one case:
//   { context: the last few messages up to that moment,
//     before: what the clinic side actually sent next (up to the client's next message),
//     after: what the concierge would do now (maybeRunConcierge with asOf: a dry
//            run, nothing sent, booked, moved or logged) }
// For app/(admin)/concierge-review. Staff-gated like any other non-public route.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { maybeRunConcierge } from '@/lib/whatsappConcierge';
import { CONCIERGE_REPLAY_CASES } from '@/lib/conciergeReplayCases';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const FIELDS = 'sender, body, media_type, transcript, is_notice, created_at';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (!searchParams.has('case')) {
    return NextResponse.json(CONCIERGE_REPLAY_CASES.map((c, i) => ({ index: i, label: c.label, as_of: c.as_of })));
  }
  const c = CONCIERGE_REPLAY_CASES[Number(searchParams.get('case'))];
  if (!c) return NextResponse.json({ error: 'No such case' }, { status: 404 });

  const [{ data: earlier }, { data: later }, after] = await Promise.all([
    supabaseAdmin.from('client_messages').select(FIELDS).eq('client_id', c.client_id).lte('created_at', c.as_of).order('created_at', { ascending: false }).limit(6),
    supabaseAdmin.from('client_messages').select(FIELDS).eq('client_id', c.client_id).gt('created_at', c.as_of).order('created_at').limit(10),
    maybeRunConcierge({ clientId: c.client_id, phone: '', asOf: c.as_of }),
  ]);
  const before = [];
  for (const row of later || []) {
    if (row.sender === 'client') break;
    before.push(row);
  }
  return NextResponse.json(
    { label: c.label, as_of: c.as_of, context: (earlier || []).reverse(), before, after },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
