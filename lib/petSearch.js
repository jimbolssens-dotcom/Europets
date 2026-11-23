// lib/petSearch.js
// The search on the client app's pets list (Jim, 23 Nov): by name, patient
// number or microchip, so an owner can check whether a chip number belongs
// to one of their pets. A chip is matched on its digits alone (spaces and
// dashes ignored), from 3 digits up.

const digits = (v) => String(v || '').replace(/\D/g, '');

export function microchipMatches(pet, query) {
  const q = digits(query);
  return q.length >= 3 && digits(pet?.microchip_number).includes(q);
}

export function petMatches(pet, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return (
    (pet?.name || '').toLowerCase().includes(q) ||
    (digits(q) && digits(q) === q.replace(/[\s-]/g, '') && String(pet?.patient_number || '').includes(digits(q))) ||
    microchipMatches(pet, q)
  );
}
