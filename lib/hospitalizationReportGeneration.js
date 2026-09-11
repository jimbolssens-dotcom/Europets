import { supabase } from '@/lib/supabaseClient';
import { generateHospitalizationReport } from '@/lib/anthropicClient';
import { formatConsultReportSources } from '@/lib/consultReportSources';

export async function generateReportForHospitalization(admission) {
  const tables = ['diagnostics', 'dental_reports', 'surgical_reports', 'ultrasound_reports', 'xray_reports'];
  const [results, patientResult, notesResult] = await Promise.all([
    Promise.all(tables.map((table) => supabase.from(table)
      .select(table === 'diagnostics' ? '*, goods_services(name)' : '*')
      .eq('hospitalization_id', admission.id))),
    supabase.from('patients').select('name, species').eq('id', admission.patient_id).single(),
    supabase.from('hospitalization_notes').select('note_date, notes').eq('hospitalization_id', admission.id)
      .not('notes', 'is', null).order('note_date', { ascending: true }),
  ]);
  for (const result of results) {
    if (result.error) throw new Error('Could not load all hospitalization reports. Please try again.');
  }
  if (patientResult.error) throw new Error('Could not load the patient.');
  if (notesResult.error) throw new Error('Could not load the worksheet notes.');

  const [diagnostics, dental, surgical, ultrasound, xray] = results.map((r) => r.data || []);
  const reportSources = formatConsultReportSources({ diagnostics, dental, surgical, ultrasound, xray });
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
