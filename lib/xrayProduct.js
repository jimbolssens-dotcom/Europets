// lib/xrayProduct.js
// A diagnostic test whose catalog name mentions "x-ray"/"xray"/"radiograph"
// gets a "Dictate Report" option on its card in the consult's Diagnostics
// section — same pattern as isUltrasoundTest. Matches the XRAY_PATTERN
// already used in lib/attachmentCompression.js for x-ray image handling.

export function isXrayTest(name) {
  return /x-?ray|radiograph/i.test(name || '');
}
