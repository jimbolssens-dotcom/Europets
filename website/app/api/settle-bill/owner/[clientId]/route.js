// website/app/api/settle-bill/owner/[clientId]/route.js
// Owner/"campaign" counterpart to app/api/settle-bill/[id] — settles a
// client's whole outstanding balance across all their invoices in one
// payment, oldest-first, instead of one invoice at a time. Staff share
// this link (see the "Pay All" button on the client's page in the admin
// app) when running a campaign that people pay into for a specific owner.
//
// GET  -> balance summary for the public page. Also where a pending
//          owner-level Nomod link actually gets reconciled: the page
//          polls this repeatedly after the client returns from paying,
//          and each call re-checks Nomod's real status first (see
//          lib/nomodPayments#reconcilePendingNomodOwnerLink — Nomod's
//          webhooks are unconfirmed, so this active check is what
//          actually applies the payment).
// POST -> the client clicking "Pay Now". Creates a Nomod payment link for
//          the client's current total outstanding balance (or reuses a
//          still-pending one already created for that exact amount) and
//          returns its URL for the page to redirect to.

import { supabaseServer } from '@/lib/supabaseServer';
import { createPaymentLink } from '@/lib/nomod';
import { reconcilePendingNomodOwnerLink } from '@/lib/nomodPayments';
import { NextResponse } from 'next/server';

async function loadOutstanding(clientId) {
  const { data: client, error: clientError } = await supabaseServer
    .from('clients')
    .select('id, full_name')
    .eq('id', clientId)
    .single();
  if (clientError || !client) return null;

  const { data: invoices } = await supabaseServer
    .from('invoices')
    .select('total, amount_paid')
    .eq('client_id', clientId)
    .in('status', ['unpaid', 'partially_paid']);

  const balanceDue =
    Math.round(
      (invoices || []).reduce(
        (sum, inv) => sum + Math.max(0, Number(inv.total) - Number(inv.amount_paid || 0)),
        0
      ) * 100
    ) / 100;

  return { client, balanceDue };
}

export async function GET(request, { params }) {
  await reconcilePendingNomodOwnerLink(params.clientId);

  const result = await loadOutstanding(params.clientId);
  if (!result) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    balance_due: result.balanceDue,
    client_first_name: result.client.full_name?.split(' ')[0] || null,
  });
}

export async function POST(request, { params }) {
  const result = await loadOutstanding(params.clientId);
  if (!result) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (result.balanceDue <= 0) {
    return NextResponse.json({ error: 'there is no balance due' }, { status: 400 });
  }

  // Reuse a still-pending link already created for this exact balance —
  // a page refresh or double-click shouldn't spawn a fresh Nomod link
  // every time. A balance change (e.g. a new invoice, or one voided)
  // invalidates the old amount match, so a new one gets created instead.
  const { data: existingLink } = await supabaseServer
    .from('nomod_payment_links')
    .select('id, url, amount')
    .eq('client_id', params.clientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingLink && Number(existingLink.amount) === result.balanceDue) {
    return NextResponse.json({ url: existingLink.url });
  }

  const origin = new URL(request.url).origin;
  let nomodLink;
  try {
    nomodLink = await createPaymentLink({
      amount: result.balanceDue,
      title: 'Europets Clinic: Outstanding balance',
      itemName: 'Outstanding balance',
      successUrl: `${origin}/settle-bill/owner/${params.clientId}?paid=1`,
      failureUrl: `${origin}/settle-bill/owner/${params.clientId}?paid=0`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'payments are temporarily unavailable, please try again shortly' },
      { status: 502 }
    );
  }

  const { data: link, error: insertError } = await supabaseServer
    .from('nomod_payment_links')
    .insert([
      { client_id: params.clientId, nomod_link_id: nomodLink.id, url: nomodLink.url, amount: result.balanceDue },
    ])
    .select('url')
    .single();

  if (insertError) {
    return NextResponse.json({ error: 'something went wrong, please try again' }, { status: 500 });
  }
  return NextResponse.json({ url: link.url });
}
