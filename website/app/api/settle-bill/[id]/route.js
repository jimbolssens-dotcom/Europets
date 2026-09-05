// app/api/settle-bill/[id]/route.js
// GET  -> invoice summary for the public "Settle Your Bill" page (balance
//          due, status, client first name — never exposes line items or
//          anything else on the invoice).
// POST -> the client clicking "Pay Now". Creates a Nomod payment link for
//          the invoice's current balance (or reuses a still-pending one
//          already created for that exact balance) and returns its URL
//          for the page to redirect to.

import { supabaseServer } from '@/lib/supabaseServer';
import { createPaymentLink } from '@/lib/nomod';
import { NextResponse } from 'next/server';

async function loadInvoice(id) {
  const { data, error } = await supabaseServer
    .from('invoices')
    .select('id, invoice_number, status, total, amount_paid, clients(full_name)')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data;
}

function balanceDue(invoice) {
  return Math.max(0, Math.round((Number(invoice.total) - Number(invoice.amount_paid || 0)) * 100) / 100);
}

export async function GET(request, { params }) {
  const invoice = await loadInvoice(params.id);
  if (!invoice) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: invoice.status,
    invoice_number: invoice.invoice_number,
    balance_due: balanceDue(invoice),
    client_first_name: invoice.clients?.full_name?.split(' ')[0] || null,
  });
}

export async function POST(request, { params }) {
  const invoice = await loadInvoice(params.id);
  if (!invoice) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (invoice.status === 'void') {
    return NextResponse.json({ error: 'this invoice has been voided' }, { status: 400 });
  }
  if (invoice.status === 'paid') {
    return NextResponse.json({ error: 'this invoice is already fully paid' }, { status: 400 });
  }

  const amount = balanceDue(invoice);
  if (amount <= 0) {
    return NextResponse.json({ error: 'there is no balance due on this invoice' }, { status: 400 });
  }

  // Reuse a still-pending link already created for this exact balance —
  // a page refresh or double-click shouldn't spawn a fresh Nomod link
  // every time. A balance change (e.g. staff adjusted the invoice)
  // invalidates the old amount match, so a new one gets created instead.
  const { data: existingLink } = await supabaseServer
    .from('nomod_payment_links')
    .select('id, url, amount')
    .eq('invoice_id', params.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingLink && Number(existingLink.amount) === amount) {
    return NextResponse.json({ url: existingLink.url });
  }

  let nomodLink;
  try {
    nomodLink = await createPaymentLink({
      amount,
      description: `Europets Clinic — Invoice #${invoice.invoice_number}`,
      reference: invoice.id,
    });
  } catch (err) {
    return NextResponse.json({ error: 'payments are temporarily unavailable — please try again shortly' }, { status: 502 });
  }

  const { data: link, error: insertError } = await supabaseServer
    .from('nomod_payment_links')
    .insert([{ invoice_id: params.id, nomod_link_id: nomodLink.id, url: nomodLink.url, amount }])
    .select('url')
    .single();

  if (insertError) {
    return NextResponse.json({ error: 'something went wrong — please try again' }, { status: 500 });
  }
  return NextResponse.json({ url: link.url });
}
