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

// A rescuer's supporter bonus (the clinic app's migration 215): the
// highest tier a single gift reaches, in AED off their bills. The clinic
// app does the same sum when it applies it (lib/supporterBonusPlan.js).
export function bonusFor(tiers, gift) {
  const best = [...(tiers || [])].filter((t) => Number(gift) >= Number(t.min)).sort((a, b) => b.min - a.min)[0];
  return best ? Number(best.bonus) : 0;
}

// The clinic's own rescuer pages (app/rescues/[token]): off until Jim
// reviews them and says they go live.
export const RESCUE_PAGES_LIVE = false;
