// lib/petsLabel.js
// The pet(s) a payment message is about, for its wording (the pet-naming
// templates in lib/metaWhatsapp.js): "Luna", "Luna and Max", "your pets"
// for more, "your pet" when we don't know. Pure, so it can be tested
// (tests/pets-label.test.mjs).

export function petsLabel(names) {
  const unique = [...new Set((names || []).map((n) => String(n || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  if (unique.length > 2) return 'your pets';
  return 'your pet';
}
