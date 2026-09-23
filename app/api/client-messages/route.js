// app/api/client-messages/route.js
// GET /api/client-messages -> the staff inbox summary: one row per
// conversation (see client_messages / migrations 120 and 130 — the
// client app's own chat, plus WhatsApp), newest thread first, each with
// its last message and a `pending` flag (the inbox's 🔔 alarm). Powers
// both the /messages inbox page and the "Messages" nav badge in
// app/(admin)/layout.js.
//
// pending used to be purely derived (true whenever the last message came
// from the client) with no idea whether staff had actually looked at it —
// opening a thread and closing it again without replying left the alarm
// on forever. It's now: flagged (an explicit, independent "still needs
// attention" override staff sets themselves — see PATCH
// /api/client-messages/thread-state) OR (last message is from the client
// AND it's newer than the last time staff opened this thread). Opening a
// thread clears the alarm on its own; a flag keeps it lit regardless of
// read status until staff clears the flag themselves. See
// migrations/140_client_message_thread_state.sql.
//
// A conversation is keyed by client_id when known; a WhatsApp message from
// a number that hasn't been linked to a client yet (migration 130) has no
// client_id, so it's keyed by its raw phone instead — thread_key tells the
// UI which of the two it's looking at (a client link vs. a "link this
// number" action), and is also the key thread-state rows are looked up by.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [{ data, error }, { data: threadStates, error: stateError }] = await Promise.all([
    supabase
      .from('client_messages')
      .select(
        'id, client_id, phone, channel, sender, body, media_type, created_at, clients(full_name, client_number, phone)'
      )
      .order('created_at', { ascending: false }),
    supabase.from('client_message_thread_state').select('thread_key, last_read_at, flagged'),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (stateError) {
    return NextResponse.json({ error: stateError.message }, { status: 500 });
  }

  const stateByThread = Object.fromEntries((threadStates || []).map((s) => [s.thread_key, s]));

  const byThread = new Map();
  for (const row of data) {
    const threadKey = row.client_id || `phone:${row.phone}`;
    if (!byThread.has(threadKey)) {
      const state = stateByThread[threadKey];
      const unread = row.sender === 'client' && (!state?.last_read_at || state.last_read_at < row.created_at);
      byThread.set(threadKey, {
        thread_key: threadKey,
        client_id: row.client_id,
        client: row.clients,
        phone: row.phone,
        channel: row.channel,
        // A photo with no caption has an empty body — fall back to a
        // short label so the inbox row isn't just blank.
        last_message: row.body || (row.media_type === 'image' ? '📷 Photo' : row.body),
        last_sender: row.sender,
        last_message_at: row.created_at,
        flagged: state?.flagged || false,
        pending: Boolean(state?.flagged) || unread,
      });
    }
  }

  return NextResponse.json(Array.from(byThread.values()));
}
