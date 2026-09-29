// app/api/accounting/legacy-payments/[id]/route.js
// PATCH  /api/accounting/legacy-payments/:id
//   { amount, payment_method, note, paid_at } -> correct a payment logged
//   in error, same idea as PATCH /api/donations/:id. Any subset of fields
//   may be sent. Because a legacy payment directly clamps down
//   clients.legacy_outstanding_balance on the way in (see POST
//   /api/clients/:id/legacy-payments), changing its amount has to reverse
//   the OLD amount's effect on the balance and re-apply the NEW one, not
//   just overwrite the row — otherwise a corrected amount would silently
//   leave the balance wrong by the difference.
// DELETE /api/accounting/legacy-payments/:id
//   Removes the payment and restores its amount to the client's
//   legacy_outstanding_balance — the reverse of what logging it did. No
//   "already applied" guard like donations has: a legacy payment has no
//   separate allocation to orphan, its only side effect is the balance,
//   which this always reverses.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const hasAmount = body.amount !== undefined;
  const hasMethod = body.payment_method !== undefined;
  const hasNote = body.note !== undefined;
  const hasPaidAt = body.paid_at !== undefined;

  if (!hasAmount && !hasMethod && !hasNote && !hasPaidAt) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data: current, error: currentError } = await supabaseAdmin
    .from('legacy_payments')
    .select('id, amount, client_id')
    .eq('id', id)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'payment not found' }, { status: 404 });

  const update = {};

  if (hasMethod) {
    const paymentMethod = typeof body.payment_method === 'string' ? body.payment_method.trim() : '';
    if (!paymentMethod) return NextResponse.json({ error: 'payment_method is required' }, { status: 400 });
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
    update.payment_method = knownMethod.name;
  }

  if (hasNote) {
    update.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  }

  if (hasPaidAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.paid_at || '')) {
      return NextResponse.json({ error: 'paid_at must be a YYYY-MM-DD date' }, { status: 400 });
    }
    update.paid_at = body.paid_at;
  }

  let newAmount = Number(current.amount);
  if (hasAmount) {
    newAmount = Number(body.amount);
    if (!newAmount || Number.isNaN(newAmount) || newAmount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }
    update.amount = Math.round(newAmount * 100) / 100;
  }

  if (hasAmount && update.amount !== Number(current.amount)) {
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('legacy_outstanding_balance')
      .eq('id', current.client_id)
      .maybeSingle();
    if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 });
    if (client) {
      // Undo the old amount's decrement, then re-apply the corrected one —
      // same clamp-at-zero the original payment used.
      const restored = Number(client.legacy_outstanding_balance || 0) + Number(current.amount);
      const newBalance = Math.max(0, Math.round((restored - update.amount) * 100) / 100);
      const { error: balanceError } = await supabaseAdmin
        .from('clients')
        .update({ legacy_outstanding_balance: newBalance })
        .eq('id', current.client_id);
      if (balanceError) return NextResponse.json({ error: balanceError.message }, { status: 500 });
    }
  }

  const { data, error } = await supabaseAdmin.from('legacy_payments').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { id } = await params;

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('legacy_payments')
    .select('id, amount, client_id')
    .eq('id', id)
    .maybeSingle();
  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });
  if (!payment) return NextResponse.json({ error: 'payment not found' }, { status: 404 });

  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('legacy_outstanding_balance')
    .eq('id', payment.client_id)
    .maybeSingle();
  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 });

  if (client) {
    const restored = Math.round((Number(client.legacy_outstanding_balance || 0) + Number(payment.amount)) * 100) / 100;
    const { error: balanceError } = await supabaseAdmin
      .from('clients')
      .update({ legacy_outstanding_balance: restored })
      .eq('id', payment.client_id);
    if (balanceError) return NextResponse.json({ error: balanceError.message }, { status: 500 });
  }

  const { error: deleteError } = await supabaseAdmin.from('legacy_payments').delete().eq('id', id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
