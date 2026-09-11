// lib/spayNeuterProduct.js
// A catalog item (or dictated checklist label) whose name mentions spay/
// neuter/castration — same name-matching pattern as isUltrasoundTest/
// isXrayTest. Used to fold the standard spay/neuter consent language into
// a day procedure's consent form when one of these is on its checklist
// (see lib/consentTemplates.js).

export function isSpayNeuterProduct(name) {
  return /spay|neuter|castrat|ovariohysterectomy/i.test(name || '');
}
