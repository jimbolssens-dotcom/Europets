// lib/payLinkRules.js
// The amounts a personal payment link takes (lib/payLinks.js), in a file of
// its own so the page can use them without loading the server's database
// client.

// Per payment, in AED; the clinic app checks the same (lib/clientCreditPlan.js).
export const PAY_LINK_MIN = 20;
export const PAY_LINK_MAX = 5000;
// Payments started through one link in an hour: card testers try many.
export const PAY_LINK_STARTS_PER_HOUR = 8;

export function payLinkAmountError(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 'Please enter an amount.';
  if (n < PAY_LINK_MIN) return `The smallest amount is AED ${PAY_LINK_MIN}.`;
  if (n > PAY_LINK_MAX) return `The largest amount in one payment is AED ${PAY_LINK_MAX.toLocaleString('en-US')}.`;
  return null;
}
