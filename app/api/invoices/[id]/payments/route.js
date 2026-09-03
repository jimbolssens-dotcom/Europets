// app/api/invoices/[id]/payments/route.js
// POST /api/invoices/:id/payments -> log a payment (partial or full)
// against an invoice. Recomputes invoices.amount_paid and flips status
// between unpaid -> partially_paid -> paid automatically as payments
// accumulate — there's no way to mark an invoice paid without the amount
// actually adding up (see app/api/invoices/[id]/route.js, which no
// longer accepts status: 'paid' directly).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { recomputeInvoicePayments } from '@/lib/invoicing';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'payment_link'];

export async function POST(request, { params }) {
  const body = await request.json();
  const { amount, payment_method, received_by } = body;

  const numericAmount = Number(amount);
  if (!numericAmount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }
  if (!payment_method || !PAYMENT_METHODS.includes(payment_method)) {
    return NextResponse.json(
      { error: `payment_method must be one of ${PAYMENT_METHODS.join(', ')}` },
      { status: 400 }
    );
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('total, amount_paid, status')
    .eq('id', params.id)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  }
  if (invoice.status === 'void') {
    return NextResponse.json({ error: 'cannot log a payment on a void invoice' }, { status: 400 });
  }
  if (invoice.status === 'paid') {
    return NextResponse.json({ error: 'invoice is already fully paid' }, { status: 400 });
  }

  // A little slack for floating-point rounding on the remaining balance,
  // not an invitation to overpay by any real amount.
  const remaining = Math.round((Number(invoice.total) - Number(invoice.amount_paid)) * 100) / 100;
  if (numericAmount > remaining + 0.01) {
    return NextResponse.json(
      { error: `amount exceeds the remaining balance of AED ${remaining.toFixed(2)}` },
      { status: 400 }
    );
  }

  const { data: payment, error: insertError } = await supabase
    .from('invoice_payments')
    .insert([
      {
        invoice_id: params.id,
        amount: Math.round(numericAmount * 100) / 100,
        payment_method,
        received_by: received_by || null,
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: updatedInvoice, error: recomputeError } = await recomputeInvoicePayments(
    supabase,
    params.id
  );
  if (recomputeError) {
    return NextResponse.json({ error: recomputeError.message }, { status: 500 });
  }

  return NextResponse.json({ payment, invoice: updatedInvoice }, { status: 201 });
}
