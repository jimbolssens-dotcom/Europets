// app/api/empty-reports/route.js
// GET /api/empty-reports -> every report-type record across the clinic
// that was created but never actually filled in AND never had a file
// attached: an empty "Dictate Report" shell (ai_summary never set) for
// dental/surgical/ultrasound/x-ray, or a diagnostic test with no result
// logged — the same "empty shell doesn't count" distinction GET
// /api/xray-reports (and its siblings) already draw for the SAVED-reports
// views, just inverted. A record with a photo/PDF attached (e.g. a
// diagnostic report whose lab PDF was uploaded — AI never auto-reads
// these, see lib/diagnosticReportPolicy.js) is NOT empty: the original
// file on the attachment is the record, so it's excluded here even with
// no result text. Powers the Empty Reports page linked
// from Settings, so a report that was started and then never finished
// (no dictation, no result, no file at all) can be traced back and
// completed instead of quietly staying blank on the patient's record.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const RELATIONS =
  'visits(patients(id, name, species), clients(id, full_name)), hospitalizations(patients(id, name, species), clients(id, full_name))';

// attachments.entity_type for each report kind (see AttachmentSection
// call sites across the consult/hospitalization pages and mobile app).
const ENTITY_TYPE_BY_REPORT_TYPE = {
  dental: 'dental_report',
  surgical: 'surgical_report',
  ultrasound: 'ultrasound_report',
  xray: 'xray_report',
  gastroscopy: 'gastroscopy_report',
  diagnostic: 'diagnostic',
};

function recordHref(row) {
  return row.visit_id ? `/consults/${row.visit_id}` : `/hospitalization/${row.hospitalization_id}`;
}

function patientClientFor(row) {
  const record = row.visit_id ? row.visits : row.hospitalizations;
  return { patient: record?.patients || null, client: record?.clients || null };
}

export async function GET() {
  const [dental, surgical, ultrasound, xray, gastroscopy, diagnostics] = await Promise.all([
    supabase
      .from('dental_reports')
      .select(`id, visit_id, hospitalization_id, performed_at, created_at, ${RELATIONS}`)
      .is('ai_summary', null),
    supabase
      .from('surgical_reports')
      .select(`id, visit_id, hospitalization_id, performed_at, created_at, procedure_name, ${RELATIONS}`)
      .is('ai_summary', null),
    supabase
      .from('ultrasound_reports')
      .select(`id, visit_id, hospitalization_id, performed_at, created_at, ${RELATIONS}`)
      .is('ai_summary', null),
    supabase
      .from('xray_reports')
      .select(`id, visit_id, hospitalization_id, performed_at, created_at, ${RELATIONS}`)
      .is('ai_summary', null),
    supabase
      .from('gastroscopy_reports')
      .select(`id, visit_id, hospitalization_id, performed_at, created_at, ${RELATIONS}`)
      .is('ai_summary', null),
    supabase
      .from('diagnostics')
      .select(`id, visit_id, hospitalization_id, created_at, type, goods_services(name), ${RELATIONS}`)
      .is('result', null),
  ]);

  const candidates = [
    ...(dental.data || []).map((r) => ({ ...r, kind: 'Dental report', date: r.performed_at || r.created_at, reportType: 'dental' })),
    ...(surgical.data || []).map((r) => ({
      ...r,
      kind: r.procedure_name ? `Surgical report — ${r.procedure_name}` : 'Surgical report',
      date: r.performed_at || r.created_at,
      reportType: 'surgical',
    })),
    ...(ultrasound.data || []).map((r) => ({ ...r, kind: 'Ultrasound report', date: r.performed_at || r.created_at, reportType: 'ultrasound' })),
    ...(xray.data || []).map((r) => ({ ...r, kind: 'X-ray report', date: r.performed_at || r.created_at, reportType: 'xray' })),
    ...(gastroscopy.data || []).map((r) => ({ ...r, kind: 'Gastroscopy report', date: r.performed_at || r.created_at, reportType: 'gastroscopy' })),
    ...(diagnostics.data || []).map((r) => ({
      ...r,
      kind: r.goods_services?.name || r.type || 'Diagnostic test',
      date: r.created_at,
      reportType: 'diagnostic',
    })),
  ];

  // Drop anything with at least one file attached — that file IS the
  // record even with no text logged (see the file header comment).
  const candidateIds = candidates.map((r) => r.id);
  let attachedKeys = new Set();
  if (candidateIds.length > 0) {
    const { data: attachments } = await supabase
      .from('attachments')
      .select('entity_type, entity_id')
      .in('entity_type', Object.values(ENTITY_TYPE_BY_REPORT_TYPE))
      .in('entity_id', candidateIds);
    attachedKeys = new Set((attachments || []).map((a) => `${a.entity_type}:${a.entity_id}`));
  }

  const rows = candidates
    .filter((r) => !attachedKeys.has(`${ENTITY_TYPE_BY_REPORT_TYPE[r.reportType]}:${r.id}`))
    .map((r) => {
      const { patient, client } = patientClientFor(r);
      return {
        id: r.id,
        kind: r.kind,
        reportType: r.reportType,
        date: r.date,
        href: recordHref(r),
        patient_name: patient?.name || null,
        client_name: client?.full_name || null,
      };
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return NextResponse.json(rows);
}
