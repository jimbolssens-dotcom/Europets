// lib/nomod.js
// Thin wrapper around Nomod's payment-links API, used by
// app/api/settle-bill/[id] to turn an invoice balance into a payable
// link, and by app/api/settle-bill/webhook to confirm one was paid.
//
// IMPORTANT — UNVERIFIED AGAINST NOMOD'S REAL API: this sandbox has no
// outbound network access to nomod.com, so the request/response shape
// below (endpoint path, field names, webhook signature header) is
// written to the common shape most payment-link APIs share, NOT copied
// from Nomod's own docs. Before this goes live, open Nomod's API
// reference (or their Postman collection) with a live key and adjust:
//   - NOMOD_API_BASE and the create-link path/method
//   - the request body field names in createPaymentLink()
//   - which response field is the link id vs. the payable URL
//   - the webhook signature header name and algorithm in
//     verifyWebhookSignature(), and which field in the webhook payload
//     carries "this link was paid" vs. other events (expired, etc.)
//   - the field that echoes the link id back in the webhook payload,
//     used in app/api/settle-bill/webhook/route.js to look up which
//     invoice it belongs to

import crypto from 'crypto';

const NOMOD_API_BASE = 'https://api.nomod.com/v1';

export async function createPaymentLink({ amount, currency = 'AED', description, reference }) {
  const apiKey = process.env.NOMOD_API_KEY;
  if (!apiKey) {
    throw new Error('NOMOD_API_KEY is not configured');
  }

  const res = await fetch(`${NOMOD_API_BASE}/payment-links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency,
      description,
      reference,  // our own nomod_payment_links.id — helps cross-reference in Nomod's own dashboard
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nomod API error (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  return { id: data.id, url: data.url };
}

// HMAC-SHA256 over the raw request body is the standard scheme (Stripe,
// Paymob, most others) — confirm Nomod's actual header name and algorithm
// before relying on this.
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.NOMOD_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;  // different lengths -> definitely not a match
  }
}
