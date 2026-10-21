// lib/paymentNumberRules.js
// Reading an Online Payments number (donations.donation_number, YY-MM-NN,
// see lib/paymentSequence.js) typed in by hand when staff correct one.
// Pure, so it can be tested (tests/payment-number-rules.test.mjs).

// "26-10-30", "26-10-5" or "26 10 30" -> { number: '26-10-30', prefix:
// '26-10', seq: 30 }, or null when it isn't a payment number.
export function parseOnlinePaymentNumber(value) {
  const m = String(value || '').trim().match(/^(\d{2})\s*[-/ ]\s*(\d{2})\s*[-/ ]\s*(\d{1,3})$/);
  if (!m) return null;
  const month = Number(m[2]);
  const seq = Number(m[3]);
  if (month < 1 || month > 12 || seq < 1) return null;
  const prefix = `${m[1]}-${m[2]}`;
  return { number: `${prefix}-${String(seq).padStart(2, '0')}`, prefix, seq };
}
