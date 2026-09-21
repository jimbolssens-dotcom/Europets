// app/api/client-messages/route.js
// GET /api/client-messages -> the staff inbox summary: one row per
// conversation (see client_messages / migrations 120 and 130 — the
// client app's own chat, plus WhatsApp), newest thread first, each with
// its last message and a `pending` flag (true when that last message came
// from the other party and hasn't been replied to yet). Powers both the
// /messages inbox page and the "Messages" nav badge in app/(admin)/
// layout.js — same derived-not-stored "pending" model as the
// hospitalization chat's update_requested_at, just computed here instead
// of tracked in its own column, since there's no single admission row to
// hang a flag off for a client-wide conversation.
//
// A conversation is keyed by client_id when known; a WhatsApp message from
// a number that hasn't been linked to a client yet (migration 130) has no
// client_id, so it's keyed by its raw phone instead — thread_key tells the
// UI which of the two it's looking at (a client link vs. a "link this
// number" action).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase
    .from('client_messages')
    .select('id, client_id, phone, channel, sender, body, created_at, clients(full_name, client_number, phone)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byThread = new Map();
  for (const row of data) {
    const threadKey = row.client_id || `phone:${row.phone}`;
    if (!byThread.has(threadKey)) {
      byThread.set(threadKey, {
        thread_key: threadKey,
        client_id: row.client_id,
        client: row.clients,
        phone: row.phone,
        channel: row.channel,
        last_message: row.body,
        last_sender: row.sender,
        last_message_at: row.created_at,
        pending: row.sender === 'client',
      });
    }
  }

  return NextResponse.json(Array.from(byThread.values()));
}
