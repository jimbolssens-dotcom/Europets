// lib/thankYouBalance.js
// The "Account update" line of the payment thank-you (lib/paymentThankYou.js).
// Pure, so it can be tested.
//
// A rescuer with dozens of open invoices, paying small amounts, was thanked
// each time with a six-figure balance that jumped up and down as new
// invoices were added (concierge reviews 19 and 26 Nov). With more than
// MANY_OPEN_INVOICES open, the line points to the page with everything
// instead of repeating the total.

export const MANY_OPEN_INVOICES = 10;

// openCount: invoices still open. remainingLabel: e.g. "1,234.50".
// invoicesText: e.g. "invoice INV-001349". payUrl: where to settle them.
export function thankYouBalanceLine({ openCount, remainingLabel, invoicesText, payUrl }) {
  if (!openCount) return 'Your account is now fully settled.';
  if (openCount > MANY_OPEN_INVOICES) return `You can see everything still open, and settle any of it, here: ${payUrl}`;
  return `A balance of AED ${remainingLabel} is still open for ${invoicesText}. You can settle it securely here: ${payUrl}`;
}
