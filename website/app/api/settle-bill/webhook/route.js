// app/api/settle-bill/webhook/route.js
// POST -> Nomod calling back to confirm a payment link was paid (IF
// Nomod's account has webhooks at all — their own team said, as of
// mid-2025, that webhooks weren't available yet and to poll GET
// /v1/links/:id instead; see lib/nomod.js). That polling path
// (reconcilePendingNomodLink, triggered by the Settle Your Bill page)
// is the one actually wired up and confirmed working end to end — this
// route stays in place in case webhooks turn out to exist or ship later,
// but until then may simply never fire.
//
// IMPORTANT — UNVERIFIED AGAINST NOMOD'S REAL WEBHOOK SHAPE: the
// event-type field, the signature header name, and the field carrying
// "which link is this" below are all best-guess placeholders — Nomod's
// docs (as reviewed 2026-09-05) don't cover webhooks at all.

import { verifyWebhookSignature } from '@/lib/nomod';
import { recordNomodPayment } from '@/lib/nomodPayments';
import { supabaseServer } from '@/lib/supabaseServer';
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

  await recordNomodPayment(link, link.invoice_id);

  return NextResponse.json({ ok: true });
}
