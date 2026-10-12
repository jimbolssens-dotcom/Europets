// app/api/invoices/[id]/reminders/route.js
// GET -> this invoice's payment reminder log (invoice_reminders, newest
// first), shown on the invoice page. Staff only (middleware).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data, error } = await supabaseAdmin
    .from('invoice_reminders')
    .select('id, stage, channel, status, error, amount_due, sent_at')
    .eq('invoice_id', params.id)
    .order('sent_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
