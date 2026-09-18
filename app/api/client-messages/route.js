// app/api/client-messages/route.js
// GET /api/client-messages -> the staff inbox summary: one row per client
// who has ever sent or received a general chat message (see
// client_messages / migration 120), newest thread first, each with its
// last message and a `pending` flag (true when that last message came
// from the client and hasn't been replied to yet). Powers both the
// /messages inbox page and the "Messages" nav badge in app/(admin)/
// layout.js — same derived-not-stored "pending" model as the
// hospitalization chat's update_requested_at, just computed here instead
// of tracked in its own column, since there's no single admission row to
// hang a flag off for a client-wide conversation.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase
    .from('client_messages')
    .select('id, client_id, sender, body, created_at, clients(full_name, client_number, phone)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byClient = new Map();
  for (const row of data) {
    if (!byClient.has(row.client_id)) {
      byClient.set(row.client_id, {
        client_id: row.client_id,
        client: row.clients,
        last_message: row.body,
        last_sender: row.sender,
        last_message_at: row.created_at,
        pending: row.sender === 'client',
      });
    }
  }

  return NextResponse.json(Array.from(byClient.values()));
}
