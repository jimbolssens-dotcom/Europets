// app/api/clients/[id]/legacy-payments/route.js
// GET  -> this client's logged legacy payments, newest first.
// POST { amount } -> records a payment against this client's
//   legacy_outstanding_balance (migration 069) as a proper legacy_payments
//   row (migration 149) AND clamps the balance down by the same amount —
//   replacing the old behavior of only ever touching the balance number
//   with nothing to show it happened. See app/(admin)/clients/[id]/page.jsx's
//   recordLegacyPayment.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { id } = await params;
  const { data, error } = await supabase
    .from('legacy_payments')
    .select('id, amount, paid_at, created_at')
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
    .insert([{ client_id: id, amount }])
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
