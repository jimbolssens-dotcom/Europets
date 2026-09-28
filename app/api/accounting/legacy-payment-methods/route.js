// app/api/accounting/legacy-payment-methods/route.js
// GET  -> every staff-managed old-system payment "Origin" option (migration
//   155), alphabetical — seeded with Cash/Bank Transfer/Card/Other, but
//   anyone can add to it (e.g. "Nomod", "Tap", "PayPal") from the Record
//   payment form on a client's page. See lib/legacyPayments.js.
// POST { name } -> adds a new origin option (no-ops if it already exists,
//   case-insensitively) and returns the full updated list.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase.from('legacy_payment_methods').select('name').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data.map((row) => row.name));
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Enter a name for the new payment origin' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('legacy_payment_methods')
    .select('name')
    .ilike('name', name)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  if (!existing) {
    const { error: insertError } = await supabaseAdmin.from('legacy_payment_methods').insert([{ name }]);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin.from('legacy_payment_methods').select('name').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data.map((row) => row.name), { status: existing ? 200 : 201 });
}
