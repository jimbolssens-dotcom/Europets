// lib/vaccinationSupersede.js
// A dose given replaces the earlier ones of the same vaccine for that pet
// (migration 228): they stop counting as due. Used by POST and PATCH
// /api/vaccinations, which also refuse a dose dated in the future
// (futureDateError, lib/vaccinationCourse.js).

import { supabaseAdmin } from './supabaseAdmin';

export { futureDateError } from './vaccinationCourse';

// Marks this pet's earlier doses of the same vaccine (and any reminder for
// it with no date given yet) as replaced by dose.
export async function supersedeEarlierDoses(dose) {
  if (!dose?.date_given) return;
  const { error } = await supabaseAdmin
    .from('vaccinations')
    .update({ superseded_by: dose.id })
    .eq('patient_id', dose.patient_id)
    .eq('vaccine_protocol_id', dose.vaccine_protocol_id)
    .neq('id', dose.id)
    .is('superseded_by', null)
    .or(`date_given.lte.${dose.date_given},date_given.is.null`);
  if (error) console.error('Marking earlier vaccination doses as replaced failed', dose.id, error);
}
