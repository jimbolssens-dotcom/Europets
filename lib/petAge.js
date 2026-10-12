// lib/petAge.js
// A pet's age as the headers show it: "3 yrs" for adults, "5 mo" under
// two years, "3 wk" under two months; "~" in front when the date of birth
// is an estimate (patients.date_of_birth_estimated, migration 178).
// Plus small labels for the header's species / sex chips.

export function petAgeLabel(dateOfBirth, estimated = false, now = new Date()) {
  if (!dateOfBirth) return null;
  const dob = new Date(`${String(dateOfBirth).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dob.getTime()) || dob > now) return null;
  let months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  if (now.getDate() < dob.getDate()) months -= 1;
  const prefix = estimated ? '~' : '';
  if (months >= 24) return `${prefix}${Math.floor(months / 12)} yrs`;
  if (months >= 2) return `${prefix}${months} mo`;
  const weeks = Math.max(0, Math.floor((now - dob) / (7 * 86400000)));
  return `${prefix}${weeks} wk`;
}

// "about 4 years 6 months" -> an estimated date of birth (yyyy-mm-dd).
export function estimatedDateOfBirth(years, months, now = new Date()) {
  const y = Number(years) || 0;
  const m = Number(months) || 0;
  if (y <= 0 && m <= 0) return null;
  const d = new Date(now.getFullYear(), now.getMonth(), 15);
  d.setMonth(d.getMonth() - (y * 12 + m));
  return d.toLocaleDateString('en-CA');
}

const SEX_LABELS = {
  male: '♂ Male',
  female: '♀ Female',
  male_castrated: '♂ Castrated',
  female_spayed: '♀ Spayed',
};

export function sexLabel(sex) {
  return SEX_LABELS[sex] || null;
}

export function speciesEmoji(species) {
  const s = String(species || '').toLowerCase();
  if (s.includes('cat') || s.includes('feline')) return '🐱';
  if (s.includes('dog') || s.includes('canine')) return '🐶';
  if (s.includes('rabbit')) return '🐰';
  if (s.includes('bird') || s.includes('parrot')) return '🐦';
  if (s.includes('turtle') || s.includes('tortoise')) return '🐢';
  return '🐾';
}
