// app/api/accounting/legacy-payments/route.js
// GET [?month=YYYY-MM] -> every legacy payment (migration 149) across all
// clients, newest first, each with the client it was paid against — the
// accounting-wide view onto payments recorded from a client's own page
// (see app/api/clients/[id]/legacy-payments). Powers
// app/(admin)/accounting/legacy-payments.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

// Next.js can otherwise cache a GET route handler's response (it has no
// dynamic API calls of its own to signal it shouldn't) — this list is
// meant to reflect whatever's actually in legacy_payments right now, not
// whatever was true the first time anyone ever hit this URL. See
// app/api/hospitalizations/[id]/route.js for the same gotcha.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');

  let query = supabase
    .from('legacy_payments')
    .select('id, amount, payment_method, note, payment_number, paid_at, client_id, clients(full_name, client_number)')
    .order('paid_at', { ascending: false });

  if (month) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    query = query.gte('paid_at', start.toISOString()).lt('paid_at', end.toISOString());
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
