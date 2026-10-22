// lib/clientCreditPlan.js
// A client's personal payment link (migration 213): the amounts it takes,
// and how money paid through it (Online Payments with a client_id) is
// spread over the client's unpaid invoices, oldest money to oldest invoice,
// with whatever is left kept as credit. Pure, so it can be tested
// (tests/client-credit.test.mjs); lib/clientCredit.js does the writing.

// Per payment, in AED. The same limits are checked on the website
// (website/lib/payLinkRules.js).
export const PAY_LINK_MIN = 20;
export const PAY_LINK_MAX = 5000;

export function payLinkAmountError(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 'Enter an amount.';
  if (n < PAY_LINK_MIN) return `The smallest amount is AED ${PAY_LINK_MIN}.`;
  if (n > PAY_LINK_MAX) return `The largest amount in one payment is AED ${PAY_LINK_MAX.toLocaleString('en-US')}.`;
  return null;
}

const cents = (n) => Math.round(Number(n || 0) * 100);

// credits: [{ donation_id, remaining }] oldest first; invoices: [{ id,
// total, amount_paid }] oldest first. Returns [{ donation_id, invoice_id,
// amount }]: each invoice filled from the oldest money until it runs out.
export function planCreditApplication(credits, invoices) {
  const left = credits.map((c) => ({ id: c.donation_id, cents: cents(c.remaining) })).filter((c) => c.cents > 0);
  const out = [];
  for (const inv of invoices) {
    let due = cents(inv.total) - cents(inv.amount_paid);
    for (const c of left) {
      if (due <= 0) break;
      if (c.cents <= 0) continue;
      const take = Math.min(due, c.cents);
      c.cents -= take;
      due -= take;
      out.push({ donation_id: c.id, invoice_id: inv.id, amount: take / 100 });
    }
  }
  return out;
}

// When credit pays an invoice, the money is booked on the later of the
// two: the day it was received, or the day the invoice was made (credit
// can't pay a bill before the bill exists).
export function creditPaidAt(receivedBookedAt, invoiceCreatedAt) {
  const a = Date.parse(receivedBookedAt || '') || 0;
  const b = Date.parse(invoiceCreatedAt || '') || 0;
  return new Date(Math.max(a, b, 0) || Date.now()).toISOString();
}

// A payment that came in within the hour gets the usual "we received your
// payment" thank-you (lib/paymentThankYou.js); credit kept from earlier and
// used on a new invoice doesn't, since nothing new was paid.
export const FRESH_PAYMENT_MS = 60 * 60 * 1000;
export function isFreshPayment(donationCreatedAt, now = Date.now()) {
  const at = Date.parse(donationCreatedAt || '');
  return Number.isFinite(at) && now - at < FRESH_PAYMENT_MS;
}
