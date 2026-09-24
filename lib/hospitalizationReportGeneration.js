import { supabase } from '@/lib/supabaseClient';
import { generateHospitalizationReport } from '@/lib/anthropicClient';
import { formatConsultReportSources } from '@/lib/consultReportSources';

// Same case-family resolution as lib/caseReportScope.js's resolveCaseScope
// (used client-side by the Reports section), reimplemented with direct
// Supabase queries instead of fetch since this runs server-side — a report
// table is only ever tagged with the single visit_id/hospitalization_id it
// was created under, so a diagnostic ordered during the consult that
// preceded this admission (still carrying only its own visit_id, never
// re-tagged with hospitalization_id) needs its visit_id folded in here too,
// or it silently never reaches the report despite showing on the page.
async function resolveCaseScope(admission) {
  const hospitalizationIds = new Set([admission.id]);
  const visitIds = new Set();
  if (admission.originating_visit_id) visitIds.add(admission.originating_visit_id);

  if (admission.originating_hospitalization_id) {
    hospitalizationIds.add(admission.originating_hospitalization_id);
    const { data: parent } = await supabase
      .from('hospitalizations')
      .select('originating_visit_id')
      .eq('id', admission.originating_hospitalization_id)
      .maybeSingle();
    if (parent?.originating_visit_id) visitIds.add(parent.originating_visit_id);
  }

  const { data: children } = await supabase
    .from('hospitalizations')
    .select('id, originating_visit_id')
    .eq('originating_hospitalization_id', admission.id);
  (children || []).forEach((child) => {
    hospitalizationIds.add(child.id);
    if (child.originating_visit_id) visitIds.add(child.originating_visit_id);
  });

  return { hospitalizationIds: [...hospitalizationIds], visitIds: [...visitIds] };
}

export async function generateReportForHospitalization(admission) {
  const { hospitalizationIds, visitIds } = await resolveCaseScope(admission);
  const scopeFilter = [
    `hospitalization_id.in.(${hospitalizationIds.join(',')})`,
    visitIds.length > 0 ? `visit_id.in.(${visitIds.join(',')})` : null,
  ].filter(Boolean).join(',');

  const tables = ['diagnostics', 'dental_reports', 'surgical_reports', 'ultrasound_reports', 'xray_reports', 'gastroscopy_reports'];
  const [results, patientResult, notesResult] = await Promise.all([
    Promise.all(tables.map((table) => supabase.from(table)
      .select(table === 'diagnostics' ? '*, goods_services(name)' : '*')
      .or(scopeFilter))),
    supabase.from('patients').select('name, species').eq('id', admission.patient_id).single(),
    // Worksheet notes stay scoped to this record alone, unlike the report
    // tables above — a spun-off day procedure's own worksheet documents its
    // own separate stay, not this admission's, so merging it in here would
    // mix two different days' monitoring notes into one "stay" narrative.
    supabase.from('hospitalization_notes').select('note_date, notes').eq('hospitalization_id', admission.id)
      .not('notes', 'is', null).order('note_date', { ascending: true }),
  ]);
  for (const result of results) {
    if (result.error) throw new Error('Could not load all hospitalization reports. Please try again.');
  }
  if (patientResult.error) throw new Error('Could not load the patient.');
  if (notesResult.error) throw new Error('Could not load the worksheet notes.');

  const [diagnostics, dental, surgical, ultrasound, xray, gastroscopy] = results.map((r) => r.data || []);
  const reportSources = formatConsultReportSources({ diagnostics, dental, surgical, ultrasound, xray, gastroscopy });
  const dailyNotes = (notesResult.data || [])
    .filter((n) => n.notes?.trim())
    .map((n) => `${n.note_date}: ${n.notes.trim()}`)
    .join('\n\n');

  return generateHospitalizationReport({
    patientName: patientResult.data.name,
    species: patientResult.data.species,
    reason: admission.reason,
    dailyNotes,
    reportSources,
  });
}
