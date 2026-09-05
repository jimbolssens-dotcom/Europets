// app/api/settle-bill/webhook/route.js
// POST -> Nomod calling back to confirm a payment link was paid. Marks
// that link 'paid', logs a matching invoice_payments row (payment_method
// 'payment_link', no staff attached — see migration 058), and recomputes
// the invoice's amount_paid/status the same way the staff app's own
// lib/invoicing.js recomputeInvoicePayments does, since that function
// lives in the other Next.js app and isn't reachable from here.
//
// IMPORTANT — UNVERIFIED AGAINST NOMOD'S REAL WEBHOOK SHAPE: see the
// warning at the top of lib/nomod.js. The event-type field, the
// signature header name, and the field carrying "which link is this"
// below are all best-guess placeholders pending Nomod's real docs.

import { supabaseServer } from '@/lib/supabaseServer';
import { verifyWebhookSignature } from '@/lib/nomod';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-nomod-signature');

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const eventType = payload.event || payload.type;
  const nomodLinkId = payload.data?.id || payload.link_id || payload.id;

  // Anything that isn't a successful payment (expired, cancelled, a link
  // merely being viewed, etc.) — acknowledge and do nothing, so Nomod
  // doesn't keep retrying an event we're intentionally ignoring.
  const PAID_EVENTS = ['payment.completed', 'payment.succeeded', 'link.paid'];
  if (!PAID_EVENTS.includes(eventType) || !nomodLinkId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: link, error: linkError } = await supabaseServer
    .from('nomod_payment_links')
    .select('id, invoice_id, amount, status')
    .eq('nomod_link_id', nomodLinkId)
    .single();

  if (linkError || !link) {
    // Nothing on our side to match — acknowledge anyway so Nomod doesn't
    // retry forever over a link we don't recognize.
    return NextResponse.json({ ok: true, unmatched: true });
  }
  if (link.status === 'paid') {
    return NextResponse.json({ ok: true, already_processed: true });
  }

  const now = new Date().toISOString();

  await supabaseServer
    .from('nomod_payment_links')
    .update({ status: 'paid', paid_at: now })
    .eq('id', link.id);

  await supabaseServer
    .from('invoice_payments')
    .insert([{ invoice_id: link.invoice_id, amount: link.amount, payment_method: 'payment_link', paid_at: now }]);

  const { data: invoice } = await supabaseServer
    .from('invoices')
    .select('total, status')
    .eq('id', link.invoice_id)
    .single();
  const { data: payments } = await supabaseServer
    .from('invoice_payments')
    .select('amount, paid_at')
    .eq('invoice_id', link.invoice_id);

  if (invoice && invoice.status !== 'void') {
    const amountPaid = Math.round((payments || []).reduce((sum, p) => sum + Number(p.amount), 0) * 100) / 100;
    const update = { amount_paid: amountPaid };
    if (amountPaid <= 0) {
      update.status = 'unpaid';
      update.paid_at = null;
    } else if (amountPaid < Number(invoice.total)) {
      update.status = 'partially_paid';
      update.paid_at = null;
    } else {
      update.status = 'paid';
      update.paid_at = payments.reduce((latest, p) => (!latest || p.paid_at > latest ? p.paid_at : latest), null);
    }
    await supabaseServer.from('invoices').update(update).eq('id', link.invoice_id);
  }

  return NextResponse.json({ ok: true });
}
