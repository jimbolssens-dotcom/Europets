// lib/manualReportGeneration.js
// Generates the same AI client report a dictation produces (see
// lib/recordingProcessing.js's isProcedureReport/isUltrasoundReport/
// isXrayReport branches) — but from a report row's own manually typed
// fields instead of a recording transcript, for a surgical/dental/
// ultrasound/x-ray report added by hand rather than dictated. Called by
// each report type's own POST .../generate-report route.

import { supabase } from '@/lib/supabaseClient';
import { generateClientReport, generateUltrasoundReport, generateXrayReport } from '@/lib/anthropicClient';
import { describeDentalChart } from '@/lib/dentalChartLayout';

const REPORT_TABLES = {
  surgical_report: 'surgical_reports',
  dental_report: 'dental_reports',
  ultrasound_report: 'ultrasound_reports',
  xray_report: 'xray_reports',
};

// Folds a report's own typed columns into the same kind of plain-text
// block a dictation transcript would produce, so it can go straight into
// generateClientReport/generateUltrasoundReport/generateXrayReport below
// unchanged — those don't care whether the text came from a transcript or
// was typed by hand.
function manualEntryText(reportType, row) {
  if (reportType === 'surgical_report') {
    return [row.procedure_name && `Procedure: ${row.procedure_name}`, row.notes].filter(Boolean).join('\n\n');
  }
  if (reportType === 'dental_report') {
    return [
      row.findings && `Findings: ${row.findings}`,
      row.procedures_performed && `Procedures performed: ${row.procedures_performed}`,
      row.notes,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  // ultrasound_report / xray_report
  return [row.findings, row.notes].filter(Boolean).join('\n\n');
}

export async function generateReportFromManualEntry(reportType, reportId) {
  const table = REPORT_TABLES[reportType];
  if (!table) throw new Error(`Unknown report type: ${reportType}`);

  const { data: row, error: rowError } = await supabase
    .from(table)
    .select('*, visits(patients(name, species, dental_chart))')
    .eq('id', reportId)
    .single();
  if (rowError) throw new Error(rowError.message);

  const text = manualEntryText(reportType, row);
  if (!text.trim()) {
    throw new Error('Add findings/notes first, then generate the report.');
  }

  const patient = row.visits?.patients;
  let summary;

  if (reportType === 'surgical_report' || reportType === 'dental_report') {
    const procedureType = reportType === 'surgical_report' ? 'surgical' : 'dental';
    const baselineColumn = reportType === 'surgical_report' ? 'surgical_postop_baseline' : 'dental_postop_baseline';
    const { data: clinic } = await supabase
      .from('clinic_settings')
      .select(baselineColumn)
      .eq('id', true)
      .maybeSingle();

    summary = await generateClientReport({
      procedureType,
      transcript: text,
      patientName: patient?.name,
      species: patient?.species,
      baseline: clinic?.[baselineColumn],
      dentalChartContext:
        procedureType === 'dental' && patient ? describeDentalChart(patient.species, patient.dental_chart) : null,
    });
  } else if (reportType === 'ultrasound_report') {
    summary = await generateUltrasoundReport({ transcript: text, patientName: patient?.name, species: patient?.species });
  } else {
    summary = await generateXrayReport({ transcript: text, patientName: patient?.name, species: patient?.species });
  }

  const { data: updated, error: updateError } = await supabase
    .from(table)
    .update({ ai_summary: summary })
    .eq('id', reportId)
    .select('*, staff(full_name)')
    .single();
  if (updateError) throw new Error(updateError.message);

  return updated;
}
