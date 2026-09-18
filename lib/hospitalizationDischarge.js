// lib/hospitalizationDischarge.js
// Side effects of discharging a hospitalization — an admission or a day
// procedure, both of which use this same 'admitted' -> 'discharged'
// status (see schema.sql) — beyond the status/discharged_at write itself
// (each caller does that its own way — see
// app/api/hospitalizations/[id]/route.js's generic field update, and
// lib/invoicing.js's auto-discharge when its invoice is paid in full).

import { compressAttachmentsForClosedRecord } from '@/lib/attachmentCompression';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { runConsultCompletionEffects } from '@/lib/consultCompletion';

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

  // Discharging closes out the whole case — if it grew out of a consult
  // (originating_visit_id), that consult is done too, so complete it the
  // same way the "Complete Consult" button does (see completeConsult on
  // the consult page and PATCH /api/visits/:id), instead of leaving staff
  // to notice it's still sitting open in the consults board and close it
  // by hand. Mirrors closeLinkedRecordsOnFullPayment's identical
  // auto-complete-on-paid pattern in lib/invoicing.js. Best-effort: the
  // hospitalization is already discharged by the time this runs, so a
  // hiccup here shouldn't undo or block that.
  try {
    const { data: hospitalization } = await supabase
      .from('hospitalizations')
      .select('originating_visit_id')
      .eq('id', hospitalizationId)
      .single();
    if (hospitalization?.originating_visit_id) {
      const { data: visit } = await supabase
        .from('visits')
        .select('status')
        .eq('id', hospitalization.originating_visit_id)
        .maybeSingle();
      if (visit && visit.status !== 'complete') {
        const { data: completedVisit, error } = await supabaseAdmin
          .from('visits')
          .update({ status: 'complete', ended_at: new Date().toISOString() })
          .eq('id', hospitalization.originating_visit_id)
          .select()
          .single();
        if (error) throw error;
        await runConsultCompletionEffects(supabase, completedVisit);
      }
    }
  } catch (err) {
    console.error('Failed to auto-complete the linked consult after discharge', hospitalizationId, err);
  }
}
