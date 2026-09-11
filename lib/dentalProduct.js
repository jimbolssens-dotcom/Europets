// lib/dentalProduct.js
// A catalog item (or dictated checklist label) whose name mentions dental
// work — same name-matching pattern as isUltrasoundTest/isXrayTest. Used
// to fold the dental consent language into a day procedure's consent form
// when one of these is on its checklist (see lib/consentTemplates.js).

export function isDentalProduct(name) {
  return /dental/i.test(name || '');
}
