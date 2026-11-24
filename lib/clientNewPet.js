// lib/clientNewPet.js
// A pet a client adds themselves in the client app (Jim, 24 Nov;
// migration 262): checked here, by the route and by the form. It goes on
// file straight away, marked added_by_client_at for staff to check.

import { cleanMicrochip, microchipError, birthDateError } from './ownerPetDetails.js';

export const CLIENT_PET_SEXES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'female_spayed', label: 'Female (spayed)' },
  { value: 'male_castrated', label: 'Male (castrated)' },
  { value: 'unknown', label: 'Not sure' },
];

const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

// The new pet as patient columns, or { error }.
export function clientNewPet(body, today) {
  const name = clean(body?.name, 60);
  if (!name) return { error: "Enter your pet's name" };
  const species = clean(body?.species, 40).toLowerCase();
  if (!species) return { error: 'Choose a species' };
  const sex = String(body?.sex || '');
  if (!CLIENT_PET_SEXES.some((s) => s.value === sex)) return { error: 'Choose the sex (or "Not sure")' };
  const chipError = microchipError(body?.microchip_number);
  if (chipError) return { error: chipError };
  const dob = body?.date_of_birth || '';
  const dobError = birthDateError(dob, today);
  if (dobError) return { error: dobError };
  return {
    data: {
      name,
      species,
      sex,
      breed: clean(body?.breed, 60) || null,
      color: clean(body?.color, 40) || null,
      date_of_birth: dob || null,
      microchip_number: cleanMicrochip(body?.microchip_number) || null,
    },
  };
}
