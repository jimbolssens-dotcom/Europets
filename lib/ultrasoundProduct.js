// lib/ultrasoundProduct.js
// A diagnostic test whose catalog name mentions "ultrasound" (e.g.
// "Abdominal Ultrasound") gets a "Dictate Report" option on its card in
// the consult's Diagnostics section — same pattern as isMicrochipProduct.

export function isUltrasoundTest(name) {
  return /ultrasound/i.test(name || '');
}
