// lib/phoneMatch.js
// Phone numbers get typed with inconsistent formatting (+971501234567 vs
// +971 501234567 vs 0501234567, ...) — comparing raw strings misses
// obvious duplicates. This strips everything but digits and keeps just the
// trailing digits (long enough to stay specific to one UAE mobile number,
// short enough to survive a missing/extra country code or leading 0).

const SIGNIFICANT_DIGITS = 8;

export function phoneSearchDigits(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.slice(-SIGNIFICANT_DIGITS);
}
