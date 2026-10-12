// app/api/payment-messages/route.js
// POST { invoice_id } or { client_id }, kind?: 'link' | 'reminder',
//   scope?: 'all' | 'one' (for an invoice whose client has other open ones)
//   -> sends a payment link (or gentle reminder) from the clinic's WhatsApp
//      Business number (lib/paymentMessages.js). Staff only (middleware).
//      { fallback: true } in the error means the template isn't approved
//      yet: the page then opens staff WhatsApp as before.

import { sendPaymentWhatsApp } from '@/lib/paymentMessages';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const result = await sendPaymentWhatsApp({
    invoiceId: body.invoice_id || null,
    clientId: body.client_id || null,
    kind: body.kind === 'reminder' ? 'reminder' : 'link',
    scope: body.scope === 'all' || body.scope === 'one' ? body.scope : null,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status || 500 });
  return NextResponse.json(result);
}
