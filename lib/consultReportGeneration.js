import { supabase } from '@/lib/supabaseClient';
import { generateConsultReport } from '@/lib/anthropicClient';
import { formatConsultReportSources } from '@/lib/consultReportSources';

export async function generateReportForConsult(visit) {
  const tables = ['diagnostics', 'dental_reports', 'surgical_reports', 'ultrasound_reports', 'xray_reports'];
  const results = await Promise.all(tables.map((table) => supabase.from(table)
    .select(table === 'diagnostics' ? '*, goods_services(name)' : '*')
    .eq('visit_id', visit.id)));
  for (const result of results) {
    if (result.error) throw new Error('Could not load all consult reports. Please try again.');
  }
  const { data: patient, error } = await supabase.from('patients').select('name, species').eq('id', visit.patient_id).single();
  if (error) throw new Error('Could not load the patient.');
  const [diagnostics, dental, surgical, ultrasound, xray] = results.map((r) => r.data || []);
  const reportSources = formatConsultReportSources({ diagnostics, dental, surgical, ultrasound, xray });
  return generateConsultReport({
    patientName: patient.name, species: patient.species,
    anamnesis: visit.anamnesis, findings: visit.findings, diagnosis: visit.diagnosis,
    testResults: visit.test_results, treatmentNotes: visit.treatment_notes, reportSources,
  });
}
