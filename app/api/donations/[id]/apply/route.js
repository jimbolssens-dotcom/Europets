// app/api/donations/[id]/apply/route.js
// POST /api/donations/:id/apply -> apply some (or all) of an online
// payment's remaining balance to either
//   { invoice_id, amount }  one of the client's new invoices: a normal
//       invoice_payments row, payment_method copied from the online
//       payment's own source, tagged with donation_id, so
//       invoices.amount_paid/status stay exactly as correct as any other
//       payment (see recomputeInvoicePayments in lib/invoicing.js); or
//   { old_system: true, client_id, amount }  the client's old-system
//       (FileMaker) balance: an old-system payment (legacy_payments, OS-
//       number) tagged with donation_id (migration 199), and the client's
//       legacy_outstanding_balance goes down by the same amount straight
//       away, exactly as recording it on the client page does.
// Either way the money is booked on the day the online payment was
// received (lib/donationAllocations.js bookedAtFor), not the day it was
// applied, so it lands in the right month in the books. received_by is
// left null: nobody personally handed this over, same convention as an
// automatic online Nomod payment.
//
// The same online payment can be applied again later to something else
// (a big transfer spread across several invoices, or part old balance and
// part new invoice), as long as its remaining balance covers it.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { recomputeInvoicePayments } from '@/lib/invoicing';
import { nextPaymentNumber } from '@/lib/paymentSequence';
import { allocatedByDonation, bookedAtFor, LEGACY_METHOD_FOR_SOURCE } from '@/lib/donationAllocations';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

async function applyToOldSystem({ donation, clientId, amount }) {
  if (!clientId) return NextResponse.json({ error: 'client_id is required' }, { status: 400 });

  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id, legacy_outstanding_balance')
    .eq('id', clientId)
    .maybeSingle();
  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 });

  const balance = round2(client.legacy_outstanding_balance);
  if (balance <= 0) {
    return NextResponse.json({ error: 'this client has no old system balance outstanding' }, { status: 400 });
  }
  if (amount > balance + 0.01) {
    return NextResponse.json(
      { error: `amount exceeds the client's old system balance of AED ${balance.toFixed(2)}` },
      { status: 400 }
    );
  }

  const bookedAt = bookedAtFor(donation.received_at) || new Date().toISOString();
  const { paymentNumber, error: numberError } = await nextPaymentNumber(supabaseAdmin, bookedAt, 'old_system');
  if (numberError) return NextResponse.json({ error: numberError.message }, { status: 500 });

  const { data: payment, error: insertError } = await supabaseAdmin
    .from('legacy_payments')
    .insert([
      {
        client_id: clientId,
        amount: round2(amount),
        payment_method: LEGACY_METHOD_FOR_SOURCE[donation.source] || 'Other',
        note: `From online payment #${donation.donation_number}`,
        payment_number: paymentNumber,
        paid_at: bookedAt,
        donation_id: donation.id,
      },
    ])
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const newBalance = Math.max(0, round2(balance - amount));
  const { error: updateError } = await supabaseAdmin
    .from('clients')
    .update({ legacy_outstanding_balance: newBalance })
    .eq('id', clientId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ legacy_payment: payment, legacy_outstanding_balance: newBalance }, { status: 201 });
}

export async function POST(request, { params }) {
  const body = await request.json();
  const { invoice_id, amount } = body;
  const toOldSystem = body.old_system === true;

  const numericAmount = Number(amount);
  if (!toOldSystem && !invoice_id) {
    return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 });
  }
  if (!numericAmount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const { data: donation, error: donationError } = await supabase
    .from('donations')
    .select('id, amount, source, received_at, donation_number')
    .eq('id', params.id)
    .single();
  if (donationError || !donation) {
    return NextResponse.json({ error: 'donation not found' }, { status: 404 });
  }

  // Already applied to invoices AND old-system balances.
  const { data: allocatedMap, error: allocError } = await allocatedByDonation([params.id]);
  if (allocError) {
    return NextResponse.json({ error: allocError.message }, { status: 500 });
  }
  const donationRemaining = round2(Number(donation.amount) - (allocatedMap[params.id] || 0));
  if (numericAmount > donationRemaining + 0.01) {
    return NextResponse.json(
      { error: `amount exceeds the payment's remaining balance of AED ${donationRemaining.toFixed(2)}` },
      { status: 400 }
    );
  }

  if (toOldSystem) {
    return applyToOldSystem({ donation, clientId: body.client_id, amount: numericAmount });
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

  const invoiceRemaining = round2(Number(invoice.total) - Number(invoice.amount_paid));
  if (numericAmount > invoiceRemaining + 0.01) {
    return NextResponse.json(
      { error: `amount exceeds the invoice's remaining balance of AED ${invoiceRemaining.toFixed(2)}` },
      { status: 400 }
    );
  }

  const bookedAt = bookedAtFor(donation.received_at);
  const { data: payment, error: insertError } = await supabaseAdmin
    .from('invoice_payments')
    .insert([
      {
        invoice_id,
        amount: round2(numericAmount),
        payment_method: donation.source,
        donation_id: params.id,
        ...(bookedAt ? { paid_at: bookedAt } : {}),
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
