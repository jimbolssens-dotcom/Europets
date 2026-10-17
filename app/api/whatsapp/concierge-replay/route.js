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
import { maybeRunConcierge, composeClosedNotice } from '@/lib/whatsappConcierge';
import { clinicClosedAt } from '@/lib/clinicHours';
import { CONCIERGE_REPLAY_CASES } from '@/lib/conciergeReplayCases';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const FIELDS = 'sender, body, media_type, transcript, is_notice, created_at';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (!searchParams.has('case')) {
    return NextResponse.json(CONCIERGE_REPLAY_CASES.map((c, i) => ({ index: i, label: c.label })));
  }
  const c = CONCIERGE_REPLAY_CASES[Number(searchParams.get('case'))];
  if (!c) return NextResponse.json({ error: 'No such case' }, { status: 404 });

  // A case given by message id: its client (or, unregistered, its phone) and the moment after it.
  let clientId = c.client_id || null;
  let phone = null;
  let asOf = c.as_of;
  if (c.message_id) {
    const { data: msg } = await supabaseAdmin.from('client_messages').select('client_id, phone, created_at').eq('id', c.message_id).maybeSingle();
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    clientId = msg.client_id;
    phone = msg.phone;
    asOf = new Date(Date.parse(msg.created_at) + 1000).toISOString();
  }
  const thread = (q) => (clientId ? q.eq('client_id', clientId) : q.eq('phone', phone).is('client_id', null));

  const [{ data: earlier }, { data: later }, concierge] = await Promise.all([
    thread(supabaseAdmin.from('client_messages').select(FIELDS)).lte('created_at', asOf).order('created_at', { ascending: false }).limit(6),
    thread(supabaseAdmin.from('client_messages').select(FIELDS)).gt('created_at', asOf).order('created_at').limit(10),
    // The concierge only answers registered clients; an unknown number only
    // ever gets the notice.
    clientId ? maybeRunConcierge({ clientId, phone: '', asOf }) : Promise.resolve({ skipped: true, unregistered: true, reason: 'not a registered client, so the AI never answers; staff see it', trace: [] }),
  ]);
  const before = [];
  for (const row of later || []) {
    if (row.sender === 'client') break;
    before.push(row);
  }
  // What the client would be told when it goes to staff, written for them at night.
  const toStaff = concierge.escalated || concierge.handoff || concierge.withStaff || concierge.unregistered;
  const now = Date.parse(asOf);
  const notice =
    toStaff && !concierge.noticeAlreadySent && clinicClosedAt(now)
      ? await composeClosedNotice({ clientId, phone, now })
      : null;
  return NextResponse.json(
    { label: c.label, as_of: asOf, context: (earlier || []).reverse(), before, after: { ...concierge, notice } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
