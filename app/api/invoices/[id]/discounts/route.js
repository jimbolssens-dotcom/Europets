// app/api/invoices/[id]/discounts/route.js
// GET /api/invoices/:id/discounts -> list discounts logged against an
// invoice. POST -> log a new discount (a plain amount off the final
// bill, applied_by required for the audit trail — see migrations/123).
// Recomputes invoices.subtotal/discount_amount/vat_amount/total, then
// invoice status/amount_paid off the new total (a discount can turn an
// already-fully-paid balance into an overpayment's worth of paid status).

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { recomputeInvoiceTotals, recomputeInvoicePayments } from '@/lib/invoicing';

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('invoice_discounts')
    .select('*, staff(full_name)')
    .eq('invoice_id', params.id)
    .order('applied_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request, { params }) {
  const body = await request.json();
  const { amount, reason, applied_by } = body;

  const numericAmount = Number(amount);
  if (!numericAmount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }
  if (!applied_by) {
    return NextResponse.json(
      { error: 'applied_by is required — select the staff member who applied this discount' },
      { status: 400 }
    );
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('status, subtotal, discount_amount')
    .eq('id', params.id)
    .single();
  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  }
  if (invoice.status === 'void') {
    return NextResponse.json({ error: 'cannot apply a discount to a void invoice' }, { status: 400 });
  }

  const remainingSubtotal = Math.round((Number(invoice.subtotal) - Number(invoice.discount_amount)) * 100) / 100;
  if (numericAmount > remainingSubtotal + 0.01) {
    return NextResponse.json(
      { error: `discount exceeds the remaining subtotal of AED ${remainingSubtotal.toFixed(2)}` },
      { status: 400 }
    );
  }

  const { data: discount, error: insertError } = await supabaseAdmin
    .from('invoice_discounts')
    .insert([
      {
        invoice_id: params.id,
        amount: Math.round(numericAmount * 100) / 100,
        reason: reason || null,
        applied_by,
      },
    ])
    .select('*, staff(full_name)')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: totalsError } = await recomputeInvoiceTotals(supabase, params.id);
  if (totalsError) {
    return NextResponse.json({ error: totalsError.message }, { status: 500 });
  }
  const { data: updatedInvoice, error: paymentsError } = await recomputeInvoicePayments(supabase, params.id);
  if (paymentsError) {
    return NextResponse.json({ error: paymentsError.message }, { status: 500 });
  }

  return NextResponse.json({ discount, invoice: updatedInvoice }, { status: 201 });
}
