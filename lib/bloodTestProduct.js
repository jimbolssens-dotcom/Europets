// lib/bloodTestProduct.js
// A diagnostic test whose catalog name looks like a blood panel (CBC, GHP,
// hematology/chemistry panel, or just "blood test") — used to skip the
// automatic photo-to-text AI transcription for blood work specifically
// (see extract-result/route.js and the isImagingDiagnostic gate it mirrors):
// staff found the transcribed text confusing and prefer to read the
// original lab PDF/photo directly instead. "Blood pressure" is a vitals
// reading, not a lab panel, so it's explicitly excluded even though it
// contains the word "blood".

export function isBloodTest(name) {
  if (!name) return false;
  if (/blood\s*pressure/i.test(name)) return false;
  return /blood|cbc|ghp|h[ae]matology|chem(?:istry)?\s*panel|biochemistry/i.test(name);
}
