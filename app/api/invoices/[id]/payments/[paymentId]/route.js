// app/api/invoices/[id]/payments/[paymentId]/route.js
// DELETE /api/invoices/:id/payments/:paymentId -> remove a logged payment
// (e.g. a data-entry mistake), recomputing the invoice's amount_paid and
// status back down afterward.
// PATCH  /api/invoices/:id/payments/:paymentId { payment_method } -> correct
// the method a payment was logged with (card logged as cash, say), even on
// a paid invoice: the amount doesn't change, so nothing else moves. The
// method it was first logged with is kept (method_corrected_from, migration
// 209) so the correction stays visible.
//
// This route sits under the general, PIN-only /api/invoices path (not
// /api/accounting or /api/donations), but removing a donation-tagged
// payment effectively hands that donation's money back to the pool — an
// accounting-consequential action the accountant should own. So that one
// case is re-checked here against the accounting password even though the
// route as a whole isn't gated.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { recomputeInvoicePayments } from '@/lib/invoicing';
import { isAccountingRequest } from '@/lib/accountingAuth';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'payment_link'];

export async function DELETE(request, { params }) {
  const { data: payment, error: fetchError } = await supabase
    .from('invoice_payments')
    .select('donation_id')
    .eq('id', params.paymentId)
    .eq('invoice_id', params.id)
    .single();
  if (fetchError || !payment) {
    return NextResponse.json({ error: 'payment not found' }, { status: 404 });
  }
  if (payment.donation_id && !(await isAccountingRequest(request))) {
    return NextResponse.json(
      { error: 'This payment came from a donation — removing it requires accounting access.' },
      { status: 403 }
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from('invoice_payments')
    .delete()
    .eq('id', params.paymentId)
    .eq('invoice_id', params.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data, error } = await recomputeInvoicePayments(supabase, params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { payment_method } = body;
  if (!PAYMENT_METHODS.includes(payment_method)) {
    return NextResponse.json({ error: `payment_method must be one of ${PAYMENT_METHODS.join(', ')}` }, { status: 400 });
  }

  const { data: payment, error: fetchError } = await supabase
    .from('invoice_payments')
    .select('payment_method, donation_id, method_corrected_from, invoices(status)')
    .eq('id', params.paymentId)
    .eq('invoice_id', params.id)
    .single();
  if (fetchError || !payment) {
    return NextResponse.json({ error: 'payment not found' }, { status: 404 });
  }
  if (payment.invoices?.status === 'void') {
    return NextResponse.json({ error: 'This invoice is void.' }, { status: 409 });
  }
  // Same rule as removing one: money applied from an online payment is the
  // accountant's to change.
  if (payment.donation_id && !(await isAccountingRequest(request))) {
    return NextResponse.json(
      { error: 'This payment came from an online payment: changing it needs accounting access.' },
      { status: 403 }
    );
  }
  if (payment.payment_method === payment_method) {
    return NextResponse.json({ error: 'That is already the method on this payment.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('invoice_payments')
    .update({
      payment_method,
      method_corrected_from: payment.method_corrected_from || payment.payment_method,
      method_corrected_at: new Date().toISOString(),
    })
    .eq('id', params.paymentId)
    .eq('invoice_id', params.id)
    .select('*, staff(full_name), donations(donation_number, source)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
