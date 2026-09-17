// app/api/donations/[id]/apply/route.js
// POST /api/donations/:id/apply -> apply some (or all) of a donation's
// remaining balance to one invoice. Under the hood this is just a normal
// invoice_payments row — payment_method copied from the donation's own
// source, tagged with donation_id — so invoices.amount_paid/status stay
// exactly as correct as any other payment (see recomputeInvoicePayments in
// lib/invoicing.js). received_by is left null: nobody personally handed
// this over, same convention as an automatic online Nomod payment.
//
// The same donation can be applied here again later against a different
// invoice — that's the whole point (a big donation spread across several
// cases) — as long as its remaining balance covers it.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { recomputeInvoicePayments } from '@/lib/invoicing';

export async function POST(request, { params }) {
  const body = await request.json();
  const { invoice_id, amount } = body;

  const numericAmount = Number(amount);
  if (!invoice_id) {
    return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 });
  }
  if (!numericAmount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const { data: donation, error: donationError } = await supabase
    .from('donations')
    .select('id, amount, source')
    .eq('id', params.id)
    .single();
  if (donationError || !donation) {
    return NextResponse.json({ error: 'donation not found' }, { status: 404 });
  }

  const { data: existingAllocations, error: allocError } = await supabase
    .from('invoice_payments')
    .select('amount')
    .eq('donation_id', params.id);
  if (allocError) {
    return NextResponse.json({ error: allocError.message }, { status: 500 });
  }
  const alreadyAllocated = (existingAllocations || []).reduce((sum, a) => sum + Number(a.amount), 0);
  const donationRemaining = Math.round((Number(donation.amount) - alreadyAllocated) * 100) / 100;
  if (numericAmount > donationRemaining + 0.01) {
    return NextResponse.json(
      { error: `amount exceeds the donation's remaining balance of AED ${donationRemaining.toFixed(2)}` },
      { status: 400 }
    );
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('total, amount_paid, status')
    .eq('id', invoice_id)
    .single();
  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  }
  if (invoice.status === 'void') {
    return NextResponse.json({ error: 'cannot apply a donation to a void invoice' }, { status: 400 });
  }
  if (invoice.status === 'paid') {
    return NextResponse.json({ error: 'invoice is already fully paid' }, { status: 400 });
  }

  const invoiceRemaining = Math.round((Number(invoice.total) - Number(invoice.amount_paid)) * 100) / 100;
  if (numericAmount > invoiceRemaining + 0.01) {
    return NextResponse.json(
      { error: `amount exceeds the invoice's remaining balance of AED ${invoiceRemaining.toFixed(2)}` },
      { status: 400 }
    );
  }

  const { data: payment, error: insertError } = await supabaseAdmin
    .from('invoice_payments')
    .insert([
      {
        invoice_id,
        amount: Math.round(numericAmount * 100) / 100,
        payment_method: donation.source,
        donation_id: params.id,
      },
    ])
    .select()
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: updatedInvoice, error: recomputeError } = await recomputeInvoicePayments(supabase, invoice_id);
  if (recomputeError) {
    return NextResponse.json({ error: recomputeError.message }, { status: 500 });
  }

  return NextResponse.json({ payment, invoice: updatedInvoice }, { status: 201 });
}
