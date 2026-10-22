// app/api/pay/[token]/route.js
// A client's personal payment link (lib/payLinks.js): any amount, paid by
// anyone, towards that client's account.
//
// GET [?link=<id>] -> who it's for (first name, pet) and what's still owed.
//          Also where payments started through this link get confirmed:
//          the page polls this after the payer comes back from Nomod, and
//          each call re-checks Nomod (lib/nomodPayments.js). With ?link,
//          also whether that one payment (the one this browser started)
//          has been received.
// POST { amount, name } -> creates a Nomod link for that amount and
//          returns its URL for the page to go to.

import { NextResponse } from 'next/server';
import { supabaseServerAdmin } from '@/lib/supabaseServerAdmin';
import { createPaymentLink } from '@/lib/nomod';
import { reconcilePendingPayLinkPayments } from '@/lib/nomodPayments';
import { loadPayLink, balanceDue, payLinkAmountError, PAY_LINK_STARTS_PER_HOUR } from '@/lib/payLinks';

export const dynamic = 'force-dynamic';

const firstName = (link) => link.clients?.full_name?.trim().split(/\s+/)[0] || null;

export async function GET(request, { params }) {
  const payLink = await loadPayLink(params.token);
  if (!payLink) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await reconcilePendingPayLinkPayments(payLink);

  const linkId = new URL(request.url).searchParams.get('link');
  let payment = null;
  if (linkId && /^[0-9a-f-]{36}$/.test(linkId)) {
    const { data } = await supabaseServerAdmin.from('nomod_payment_links').select('amount, status').eq('id', linkId).eq('pay_link_id', payLink.id).maybeSingle();
    if (data) payment = { amount: Number(data.amount), received: data.status === 'paid' };
  }
  return NextResponse.json({
    client_first_name: firstName(payLink),
    pet_name: payLink.patients?.name || null,
    balance_due: await balanceDue(payLink.client_id),
    payment,
  });
}

export async function POST(request, { params }) {
  const payLink = await loadPayLink(params.token);
  if (!payLink) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const amount = Math.round(Number(body.amount) * 100) / 100;
  const amountError = payLinkAmountError(amount);
  if (amountError) return NextResponse.json({ error: amountError }, { status: 400 });
  const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;

  // Card testers start payment after payment: a handful an hour is plenty.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseServerAdmin
    .from('nomod_payment_links')
    .select('id', { count: 'exact', head: true })
    .eq('pay_link_id', payLink.id)
    .gte('created_at', hourAgo);
  if ((count || 0) >= PAY_LINK_STARTS_PER_HOUR) {
    return NextResponse.json({ error: 'Too many payments were started from this link just now. Please try again in an hour, or message us on WhatsApp.' }, { status: 429 });
  }

  const origin = new URL(request.url).origin;
  const who = firstName(payLink);
  let nomodLink;
  try {
    nomodLink = await createPaymentLink({
      amount,
      title: `Europets Clinic: payment for ${who ? `${who}'s` : 'an'} account`,
      itemName: payLink.patients?.name ? `Towards ${payLink.patients.name}'s care` : 'Payment towards account',
      successUrl: `${origin}/pay/${params.token}?paid=1`,
      failureUrl: `${origin}/pay/${params.token}?paid=0`,
    });
  } catch {
    return NextResponse.json({ error: 'Payments are temporarily unavailable, please try again shortly.' }, { status: 502 });
  }

  const { data: row, error } = await supabaseServerAdmin
    .from('nomod_payment_links')
    .insert([{ client_id: payLink.client_id, pay_link_id: payLink.id, payer_name: name, nomod_link_id: nomodLink.id, url: nomodLink.url, amount }])
    .select('id, url')
    .single();
  // The Nomod link exists and can be paid either way (see settle-bill).
  if (error) {
    console.error('Pay-link Nomod link created but not saved', nomodLink.id, error.message);
    return NextResponse.json({ url: nomodLink.url, id: null });
  }
  return NextResponse.json({ url: row.url, id: row.id });
}
