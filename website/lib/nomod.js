// lib/nomod.js
// Thin wrapper around Nomod's Links API, used by app/api/settle-bill/[id]
// to turn an invoice balance into a payable link.
//
// Verified against Nomod's real "Create Link" API reference
// (nomod.com/docs/api-reference) on 2026-09-05 — endpoint, auth header,
// and request/response field names below are the real ones, not guesses.
//
// STILL UNVERIFIED: how to confirm a link was actually paid.
//   - Nomod's own team stated (in a public feedback thread, ~mid-2025)
//     that webhooks were not available yet and to poll a "GET Checkout"
//     style endpoint instead — but that may have shipped since.
//   - The Create Link response's `status` field is a plain string (its
//     example shows "enabled" for a fresh link) — the value it takes on
//     once paid, and whatever endpoint retrieves a link by id to re-check
//     that status, are not yet confirmed.
// Until one of those is confirmed, verifyWebhookSignature()/the webhook
// route are unverified guesses — treat a Nomod payment as needing manual
// reconciliation (staff checks the Nomod dashboard, then logs the
// payment the normal way via InvoicePaymentPanel) rather than assuming
// it'll show up in Europets automatically.

import crypto from 'crypto';

const NOMOD_API_BASE = 'https://api.nomod.com/v1';

export async function createPaymentLink({ amount, currency = 'AED', title, itemName, successUrl, failureUrl }) {
  const apiKey = process.env.NOMOD_API_KEY;
  if (!apiKey) {
    throw new Error('NOMOD_API_KEY is not configured');
  }

  const res = await fetch(`${NOMOD_API_BASE}/links`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      currency,
      items: [{ name: itemName, amount: amount.toFixed(2), quantity: 1 }],
      title,
      // Nomod redirects the client here once they finish (successfully
      // or not) — lands them back on their own Settle Your Bill page.
      success_url: successUrl,
      failure_url: failureUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nomod API error (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  return { id: data.id, url: data.url, status: data.status };
}

export async function getPaymentLink(linkId) {
  const apiKey = process.env.NOMOD_API_KEY;
  if (!apiKey) {
    throw new Error('NOMOD_API_KEY is not configured');
  }

  const res = await fetch(`${NOMOD_API_BASE}/links/${linkId}`, {
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nomod API error (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}

// Confirmed by the first real test payment (INV-602, 12 Oct 2026): a
// link's own status stays "enabled" after it's been paid (links can be
// paid more than once), so the link alone never says it was paid. The
// payment is a charge: GET /v1/charges?link_id=... (Nomod's "List
// Charges" reference) lists the charges made through that link.
export async function listLinkCharges(linkId) {
  const apiKey = process.env.NOMOD_API_KEY;
  if (!apiKey) {
    throw new Error('NOMOD_API_KEY is not configured');
  }
  const res = await fetch(`${NOMOD_API_BASE}/charges?link_id=${encodeURIComponent(linkId)}`, {
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nomod API error (${res.status}): ${text || res.statusText}`);
  }
  const data = await res.json();
  const charges = Array.isArray(data) ? data : data?.results || data?.data || data?.items || [];
  return { charges, raw: data };
}

// Charge statuses that mean the money came in. Nomod's List Charges example
// shows "authorised"; the others are the usual words for a completed card
// payment. Failed / declined / refunded / voided charges never count.
const SUCCESSFUL_CHARGE_STATUSES = ['authorised', 'authorized', 'captured', 'paid', 'succeeded', 'success', 'completed', 'settled'];

export function successfulChargeTotal(charges) {
  return (charges || [])
    .filter((c) => SUCCESSFUL_CHARGE_STATUSES.includes(String(c?.status || '').toLowerCase()))
    .reduce((sum, c) => sum + Number(c.amount ?? c.total ?? c.total_amount ?? 0), 0);
}

// UNCONFIRMED — Nomod's own "Create Link"/"Get Link" reference pages only
// ever show "enabled" (a fresh, unpaid link) in their example response;
// neither documents the value `status` takes on once a link is actually
// paid. Update this the moment a real (or smallest-possible) test
// payment shows the real value via getPaymentLink().
export const NOMOD_PAID_STATUSES = ['paid'];

export function isPaidLinkStatus(status) {
  return NOMOD_PAID_STATUSES.includes(status);
}

// UNVERIFIED — see the file header. Keeping this as-is (rather than
// deleting it) so the webhook route still has something to call once
// Nomod's real signature scheme is confirmed; right now it will always
// return false, since NOMOD_WEBHOOK_SECRET has nothing real to check
// against.
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.NOMOD_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false; // different lengths -> definitely not a match
  }
}
