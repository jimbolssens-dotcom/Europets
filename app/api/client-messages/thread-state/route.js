// app/api/client-messages/thread-state/route.js
// PATCH /api/client-messages/thread-state
//   { thread_key, mark_read?, flagged?, assigned_staff_id? }
//   -> records that staff opened a conversation (mark_read: true sets
//      last_read_at to now, clearing the inbox's 🔔 alarm for it unless
//      flagged) and/or sets its flagged state (an explicit "still needs
//      attention" override that keeps the alarm on regardless of read
//      status — the two are independent: reading something doesn't clear
//      a flag, flagging something doesn't require it to be unread), and/or
//      assigns the conversation to one staff member (assigned_staff_id: a
//      staff uuid, or null to unassign — see migrations/165). Assigning
//      pushes a one-time notification to that staff member's own phone
//      (see lib/pushNotifications.js's sendPushToStaff) if they've
//      subscribed; reassigning to someone different pushes again, but
//      re-sending the SAME assignment (no actual change) does not. See
//      migrations/140_client_message_thread_state.sql and GET
//      /api/client-messages's updated pending calculation.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPushToStaff } from '@/lib/pushNotifications';
import { NextResponse } from 'next/server';

// GET /api/client-messages/thread-state?thread_key=X -> that one
// conversation's read/flagged/assigned state, for a thread page that needs
// to know its own state to render its toggles (the inbox list's own GET
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
    .select('thread_key, last_read_at, flagged, assigned_staff_id')
    .eq('thread_key', threadKey)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data || { thread_key: threadKey, last_read_at: null, flagged: false, assigned_staff_id: null });
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const threadKey = typeof body.thread_key === 'string' ? body.thread_key : null;
  if (!threadKey) {
    return NextResponse.json({ error: 'thread_key is required' }, { status: 400 });
  }

  const assigning = 'assigned_staff_id' in body;
  const update = { thread_key: threadKey, updated_at: new Date().toISOString() };
  if (body.mark_read) update.last_read_at = new Date().toISOString();
  if (typeof body.flagged === 'boolean') update.flagged = body.flagged;
  if (assigning) update.assigned_staff_id = body.assigned_staff_id || null;

  if (!('last_read_at' in update) && !('flagged' in update) && !assigning) {
    return NextResponse.json({ error: 'mark_read, flagged, or assigned_staff_id is required' }, { status: 400 });
  }

  // Read the PREVIOUS assignment first (not just blindly push on every
  // PATCH) — the thread page re-sends its current assigned_staff_id
  // alongside unrelated updates (e.g. mark_read on every open), which
  // would otherwise re-notify the same person every single time the
  // conversation is simply opened.
  let previousAssignedStaffId = null;
  if (assigning) {
    const { data: existing } = await supabase
      .from('client_message_thread_state')
      .select('assigned_staff_id')
      .eq('thread_key', threadKey)
      .maybeSingle();
    previousAssignedStaffId = existing?.assigned_staff_id || null;
  }

  const { data, error } = await supabaseAdmin
    .from('client_message_thread_state')
    .upsert([update], { onConflict: 'thread_key' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (assigning && update.assigned_staff_id && update.assigned_staff_id !== previousAssignedStaffId) {
    // thread_key IS the client_id directly for a matched conversation
    // (same convention used everywhere else — see app/(admin)/messages),
    // only prefixed with "phone:" for an unmatched WhatsApp number.
    const isUnmatched = threadKey.startsWith('phone:');
    let clientName = isUnmatched ? threadKey.slice(6) : 'a client';
    if (!isUnmatched) {
      const { data: clientRow } = await supabase.from('clients').select('full_name').eq('id', threadKey).maybeSingle();
      clientName = clientRow?.full_name || clientName;
    }
    // Best-effort — an assignment must never fail just because the push
    // notification itself had a hiccup (no VAPID keys configured yet, a
    // revoked subscription, a transient network error).
    sendPushToStaff(update.assigned_staff_id, {
      title: 'A conversation was assigned to you',
      body: `${clientName}'s conversation was handed to you — check it when you can.`,
      url: isUnmatched ? `/mobile/messages/${encodeURIComponent(threadKey.slice(6))}` : `/mobile/messages/${threadKey}`,
    }).catch((err) => console.error('Failed to push the conversation-assigned notification', threadKey, err));
  }

  return NextResponse.json(data);
}
