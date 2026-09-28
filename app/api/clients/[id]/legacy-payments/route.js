// app/api/clients/[id]/legacy-payments/route.js
// GET  -> this client's logged legacy payments, newest first.
// POST { amount, payment_method, note?, paid_at? } -> records a payment
//   against this client's legacy_outstanding_balance (migration 069) as
//   a proper legacy_payments row (migration 149) AND clamps the balance
//   down by the same amount — replacing the old behavior of only ever
//   touching the balance number with nothing to show it happened.
//   payment_method (migration 153) is required for every new payment
//   logged this way, even though the column itself stays nullable for the
//   payments imported from the old system's own export before this field
//   existed. It's free text validated against the staff-managed
//   legacy_payment_methods list (migration 155, see
//   app/api/accounting/legacy-payment-methods) rather than a fixed enum,
//   so new origins can be added without a code change.
//   note (migration 154) is optional free text — which old invoice(s)
//   this covered, or any other context worth keeping. paid_at
//   (YYYY-MM-DD) is optional and defaults to today — lets a payment
//   actually received earlier (e.g. before this table existed) be
//   backfilled with its real date instead of the date someone got around
//   to typing it in. See app/(admin)/clients/[id]/page.jsx's
//   recordLegacyPayment.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

// Next.js can otherwise cache a GET route handler's response — see
// app/api/hospitalizations/[id]/route.js for the same gotcha.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const { data, error } = await supabase
    .from('legacy_payments')
    .select('id, amount, payment_method, note, paid_at, created_at')
    .eq('client_id', id)
    .order('paid_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }
  const paymentMethod = typeof body.payment_method === 'string' ? body.payment_method.trim() : '';
  if (!paymentMethod) {
    return NextResponse.json({ error: 'payment_method is required' }, { status: 400 });
  }
  const { data: knownMethod, error: methodError } = await supabaseAdmin
    .from('legacy_payment_methods')
    .select('name')
    .ilike('name', paymentMethod)
    .maybeSingle();
  if (methodError) return NextResponse.json({ error: methodError.message }, { status: 500 });
  if (!knownMethod) {
    return NextResponse.json(
      { error: `Unknown payment_method "${paymentMethod}" — add it as a new origin option first` },
      { status: 400 }
    );
  }
  const paidAt = typeof body.paid_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at) ? body.paid_at : null;
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('legacy_outstanding_balance')
    .eq('id', id)
    .maybeSingle();
  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const newBalance = Math.max(0, Math.round(((client.legacy_outstanding_balance || 0) - amount) * 100) / 100);

  const { data: payment, error: insertError } = await supabaseAdmin
    .from('legacy_payments')
    .insert([{ client_id: id, amount, payment_method: knownMethod.name, note, ...(paidAt ? { paid_at: paidAt } : {}) }])
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: updateError } = await supabaseAdmin
    .from('clients')
    .update({ legacy_outstanding_balance: newBalance })
    .eq('id', id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ payment, legacy_outstanding_balance: newBalance });
}
