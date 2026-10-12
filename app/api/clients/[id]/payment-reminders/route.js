// app/api/clients/[id]/payment-reminders/route.js
// GET -> the automatic payment reminders already sent to this client
// (invoice_reminders, sent only, newest first), for the client page's
// Outstanding card. Staff only (middleware).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data, error } = await supabaseAdmin
    .from('invoice_reminders')
    .select('invoice_id, stage, channel, sent_at')
    .eq('client_id', params.id)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
