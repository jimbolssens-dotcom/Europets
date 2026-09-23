// app/api/client-messages/thread-state/route.js
// PATCH /api/client-messages/thread-state  { thread_key, mark_read?, flagged? }
//   -> records that staff opened a conversation (mark_read: true sets
//      last_read_at to now, clearing the inbox's 🔔 alarm for it unless
//      flagged) and/or sets its flagged state (an explicit "still needs
//      attention" override that keeps the alarm on regardless of read
//      status — the two are independent: reading something doesn't clear
//      a flag, flagging something doesn't require it to be unread). See
//      migrations/140_client_message_thread_state.sql and GET
//      /api/client-messages's updated pending calculation.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

// GET /api/client-messages/thread-state?thread_key=X -> that one
// conversation's read/flagged state, for a thread page that needs to know
// its own flagged status to render its toggle (the inbox list's own GET
// /api/client-messages already includes this for every conversation at
// once — this is just for a single thread in isolation).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const threadKey = searchParams.get('thread_key');
  if (!threadKey) {
    return NextResponse.json({ error: 'thread_key is required' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('client_message_thread_state')
    .select('thread_key, last_read_at, flagged')
    .eq('thread_key', threadKey)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data || { thread_key: threadKey, last_read_at: null, flagged: false });
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const threadKey = typeof body.thread_key === 'string' ? body.thread_key : null;
  if (!threadKey) {
    return NextResponse.json({ error: 'thread_key is required' }, { status: 400 });
  }

  const update = { thread_key: threadKey, updated_at: new Date().toISOString() };
  if (body.mark_read) update.last_read_at = new Date().toISOString();
  if (typeof body.flagged === 'boolean') update.flagged = body.flagged;

  if (!('last_read_at' in update) && !('flagged' in update)) {
    return NextResponse.json({ error: 'mark_read or flagged is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('client_message_thread_state')
    .upsert([update], { onConflict: 'thread_key' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
