// lib/vaccineProduct.js
// A catalog item (or dictated checklist label) whose name mentions a
// vaccine — same name-matching pattern as isUltrasoundTest/isXrayTest.
// Used to link a day procedure's checklist item straight to the
// Vaccination card in its Day Procedure Report.

export function isVaccineProduct(name) {
  return /vaccin|rabies|dhpp|fvrcp|distemper|parvo|leptospirosis|bordetella|leukemia|felv|calicivirus|panleukopenia/i.test(
    name || ''
  );
}
