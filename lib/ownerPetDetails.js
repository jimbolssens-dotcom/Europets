// lib/ownerPetDetails.js
// What an owner may change about their pet from the client app (Jim,
// 10 Nov): its microchip number and date of birth. Checked here before the
// patient route saves them (app/api/patients/[id]), and by the form in the
// client app. A birth date the owner enters is a real one, so it clears
// the "estimated" flag staff set when they only guessed the age.

export const MICROCHIP_MIN = 9;
export const MICROCHIP_MAX = 15;

// Spaces, dashes and dots are dropped; letters kept (older chips have them).
export function cleanMicrochip(raw) {
  return String(raw || '').replace(/[\s.\-]/g, '').toUpperCase();
}

export function microchipError(raw) {
  const chip = cleanMicrochip(raw);
  if (!chip) return null; // removing it is allowed
  if (!/^[0-9A-Z]+$/.test(chip)) return 'A microchip number has only numbers (and sometimes letters)';
  if (chip.length < MICROCHIP_MIN || chip.length > MICROCHIP_MAX) return `A microchip number is ${MICROCHIP_MIN} to ${MICROCHIP_MAX} characters (most are 15 numbers)`;
  return null;
}

export function birthDateError(iso, today = new Date().toISOString().slice(0, 10)) {
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime())) return 'Enter a date';
  if (iso > today) return 'The date of birth is in the future';
  if (iso < '1980-01-01') return 'That date of birth looks too long ago';
  return null;
}

// The owner's changes as patient columns, or { error }.
export function ownerPetUpdate(body) {
  const update = {};
  if ('microchip_number' in body) {
    const err = microchipError(body.microchip_number);
    if (err) return { error: err };
    update.microchip_number = cleanMicrochip(body.microchip_number) || null;
  }
  if ('date_of_birth' in body) {
    const err = birthDateError(body.date_of_birth);
    if (err) return { error: err };
    update.date_of_birth = body.date_of_birth || null;
    update.date_of_birth_estimated = false;
  }
  return { update };
}
