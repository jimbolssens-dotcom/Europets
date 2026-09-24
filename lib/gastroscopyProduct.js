// lib/gastroscopyProduct.js
// A diagnostic test whose catalog name mentions "gastroscopy" gets a
// "Dictate Report" option on its card in the consult's Diagnostics
// section — same pattern as isUltrasoundTest/isXrayTest.

export function isGastroscopyTest(name) {
  return /gastroscop/i.test(name || '');
}
