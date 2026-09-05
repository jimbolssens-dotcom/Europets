// lib/vaccinationSeeding.js
// Seeds vaccination rows from a single "last vaccination date" given at
// intake (app/(admin)/patients and the public portal intake form) — one
// row per active core protocol for the patient's species, each due
// interval_months after that date. This is what puts a freshly-registered
// patient onto the existing Vaccination Reminders dashboard (app/(admin)/
// vaccinations) without staff having to enter each vaccine by hand; from
// there it's the exact same WhatsApp/email reminder flow as any other
// due vaccination — there's no separate "send at intake" mechanism, since
// this app has no connected service to send messages on its own at all.
//
// Best-effort: swallows its own errors rather than failing patient
// creation over what's ultimately a convenience derived from optional
// intake data.

import { classifySpecies } from './species';

export async function seedCoreVaccinationsFromLastGiven(supabase, patientId, species, lastVaccinationDate) {
  if (!lastVaccinationDate) return;
  const classified = classifySpecies(species);
  if (!classified) return;

  try {
    const { data: protocols } = await supabase
      .from('vaccine_protocols')
      .select('id, name, interval_months')
      .eq('species', classified)
      .eq('core', true)
      .eq('active', true);

    if (!protocols || protocols.length === 0) return;

    const given = new Date(`${lastVaccinationDate}T00:00:00`);
    const rows = protocols.map((p) => {
      const due = new Date(given);
      due.setMonth(due.getMonth() + p.interval_months);
      return {
        patient_id: patientId,
        vaccine_protocol_id: p.id,
        vaccine_name: p.name,
        date_given: lastVaccinationDate,
        next_due_date: due.toISOString().slice(0, 10),
      };
    });

    await supabase.from('vaccinations').insert(rows);
  } catch {
    // Best-effort — a failure here shouldn't take down patient creation.
  }
}
