// lib/hospitalizationDischarge.js
// Side effects of discharging a hospitalization — an admission or a day
// procedure, both of which use this same 'admitted' -> 'discharged'
// status (see schema.sql) — beyond the status/discharged_at write itself
// (each caller does that its own way — see
// app/api/hospitalizations/[id]/route.js's generic field update, and
// lib/invoicing.js's auto-discharge when its invoice is paid in full).

import { compressAttachmentsForClosedRecord } from '@/lib/attachmentCompression';

export async function runHospitalizationDischargeEffects(supabase, hospitalizationId) {
  // The case is closed — its photos won't be pulled up again the way
  // they are during an active admission, so shrink them now. Best-effort:
  // never let a compression hiccup fail the discharge itself.
  try {
    const { data: notes } = await supabase
      .from('hospitalization_notes')
      .select('id')
      .eq('hospitalization_id', hospitalizationId);

    const entityRefs = [
      { entity_type: 'hospitalization', entity_id: hospitalizationId },
      ...(notes || []).map((n) => ({ entity_type: 'hospitalization_note', entity_id: n.id })),
    ];
    await compressAttachmentsForClosedRecord(entityRefs);
  } catch {
    // See comment above — this is cleanup, not part of discharging the patient.
  }
}
