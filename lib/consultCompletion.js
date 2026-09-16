// lib/consultCompletion.js
// Side effects of marking a consult complete, beyond the status/ended_at
// write itself (each caller does that its own way — see
// app/api/visits/[id]/route.js's generic field update, and
// lib/invoicing.js's auto-complete when the consult's invoice is paid in
// full) — shared so both paths leave the consult in the same state:
// linked appointment marked complete, a draft client report generated,
// any freshly-extracted tooth locked in on the dental chart, and its
// photos shrunk for storage.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { lockExtractedTeeth } from '@/lib/dentalChartLayout';
import { compressAttachmentsForClosedRecord, isXrayDiagnostic } from '@/lib/attachmentCompression';
import { generateReportForConsult } from '@/lib/consultReportGeneration';

export async function runConsultCompletionEffects(supabase, visit) {
  if (visit.appointment_id) {
    await supabaseAdmin.from('appointments').update({ status: 'complete' }).eq('id', visit.appointment_id);
  }

  // Best-effort: never let a Claude hiccup fail "complete this consult",
  // which has already succeeded by the time this runs.
  try {
    const clientReport = await generateReportForConsult(visit);
    if (clientReport) {
      await supabaseAdmin.from('visits').update({ ai_summary: clientReport }).eq('id', visit.id);
      visit.ai_summary = clientReport;
    }
  } catch {
    // See comment above — a draft report, not part of completing the consult.
  }

  // Completing a consult "locks in" this visit's dental work — any tooth
  // just marked extracted (documented as such on the report already sent)
  // becomes a plain missing tooth for every future visit, same as one
  // that was already gone. Only touches patients with an actual dental
  // report on this visit, and only if there's something to convert.
  const { data: dentalReportsForLock } = await supabase
    .from('dental_reports')
    .select('id')
    .eq('visit_id', visit.id)
    .limit(1);
  if (dentalReportsForLock?.length) {
    const { data: patient } = await supabase.from('patients').select('dental_chart').eq('id', visit.patient_id).single();
    const locked = lockExtractedTeeth(patient?.dental_chart);
    if (locked && JSON.stringify(locked) !== JSON.stringify(patient.dental_chart)) {
      await supabaseAdmin.from('patients').update({ dental_chart: locked }).eq('id', visit.patient_id);
    }
  }

  // The consult is done — its photos won't be pulled up again the way
  // they are while active, so shrink them now to save Storage space.
  // Best-effort: never let a compression hiccup fail the actual
  // "complete this consult" action, which has already succeeded above.
  try {
    const [{ data: diagnostics }, { data: surgicalReports }, { data: dentalReports }] = await Promise.all([
      supabase.from('diagnostics').select('id, type, goods_services(name)').eq('visit_id', visit.id),
      supabase.from('surgical_reports').select('id').eq('visit_id', visit.id),
      supabase.from('dental_reports').select('id').eq('visit_id', visit.id),
    ]);

    const entityRefs = [
      ...(diagnostics || []).map((d) => ({ entity_type: 'diagnostic', entity_id: d.id })),
      ...(surgicalReports || []).map((r) => ({ entity_type: 'surgical_report', entity_id: r.id })),
      ...(dentalReports || []).map((r) => ({ entity_type: 'dental_report', entity_id: r.id })),
    ];
    const xrayEntityIds = new Set((diagnostics || []).filter(isXrayDiagnostic).map((d) => d.id));

    await compressAttachmentsForClosedRecord(entityRefs, xrayEntityIds);
  } catch {
    // See comment above — this is cleanup, not part of completing the consult.
  }
}
