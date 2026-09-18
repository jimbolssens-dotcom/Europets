// app/api/empty-reports/route.js
// GET /api/empty-reports -> every report-type record across the clinic
// that was created but never actually filled in: an empty "Dictate
// Report" shell (ai_summary never set) for dental/surgical/ultrasound/
// x-ray, or a diagnostic test with no result logged — the same "empty
// shell doesn't count" distinction GET /api/xray-reports (and its
// siblings) already draw for the SAVED-reports views, just inverted.
// Powers the Empty Reports page linked from Settings, so a report that
// was started (audio recorded, or a test ordered) and then never
// finished can be traced back and completed instead of quietly staying
// blank on the patient's record.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const RELATIONS =
  'visits(patients(id, name, species), clients(id, full_name)), hospitalizations(patients(id, name, species), clients(id, full_name))';

function recordHref(row) {
  return row.visit_id ? `/consults/${row.visit_id}` : `/hospitalization/${row.hospitalization_id}`;
}

function patientClientFor(row) {
  const record = row.visit_id ? row.visits : row.hospitalizations;
  return { patient: record?.patients || null, client: record?.clients || null };
}

export async function GET() {
  const [dental, surgical, ultrasound, xray, diagnostics] = await Promise.all([
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
      .from('diagnostics')
      .select(`id, visit_id, hospitalization_id, created_at, type, goods_services(name), ${RELATIONS}`)
      .is('result', null),
  ]);

  const rows = [
    ...(dental.data || []).map((r) => ({ ...r, kind: 'Dental report', date: r.performed_at || r.created_at, reportType: 'dental' })),
    ...(surgical.data || []).map((r) => ({
      ...r,
      kind: r.procedure_name ? `Surgical report — ${r.procedure_name}` : 'Surgical report',
      date: r.performed_at || r.created_at,
      reportType: 'surgical',
    })),
    ...(ultrasound.data || []).map((r) => ({ ...r, kind: 'Ultrasound report', date: r.performed_at || r.created_at, reportType: 'ultrasound' })),
    ...(xray.data || []).map((r) => ({ ...r, kind: 'X-ray report', date: r.performed_at || r.created_at, reportType: 'xray' })),
    ...(diagnostics.data || []).map((r) => ({
      ...r,
      kind: r.goods_services?.name || r.type || 'Diagnostic test',
      date: r.created_at,
      reportType: 'diagnostic',
    })),
  ]
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
