import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  const { data: visits } = await supabase.from('visits').select('id, started_at').eq('patient_id', params.id);
  const { data: hospitalizations } = await supabase.from('hospitalizations').select('id, admitted_at').eq('patient_id', params.id);
  const visitIds = (visits || []).map((v) => v.id);
  const hospIds = (hospitalizations || []).map((h) => h.id);
  const [dental, surgical, ultrasound, xray, diagnostics, hospReports] = await Promise.all([
    visitIds.length ? supabase.from('dental_reports').select('id, visit_id, performed_at, ai_summary, findings').in('visit_id', visitIds) : { data: [] },
    visitIds.length ? supabase.from('surgical_reports').select('id, visit_id, performed_at, ai_summary, procedure_name, notes').in('visit_id', visitIds) : { data: [] },
    visitIds.length ? supabase.from('ultrasound_reports').select('id, visit_id, performed_at, ai_summary, findings').in('visit_id', visitIds) : { data: [] },
    visitIds.length ? supabase.from('xray_reports').select('id, visit_id, performed_at, ai_summary, findings').in('visit_id', visitIds) : { data: [] },
    visitIds.length ? supabase.from('diagnostics').select('id, visit_id, created_at, type, result').in('visit_id', visitIds) : { data: [] },
    hospIds.length ? supabase.from('hospitalization_test_reports').select('id, hospitalization_id, created_at, report_type, ai_summary, source_text, result_text').in('hospitalization_id', hospIds) : { data: [] },
  ]);
  const visitDate = Object.fromEntries((visits || []).map((v) => [v.id, v.started_at]));
  const rows = [
    ...(dental.data || []).map((r) => ({ ...r, source: 'consult', kind: 'Dental report', date: r.performed_at || visitDate[r.visit_id], href: `/consults/${r.visit_id}` })),
    ...(surgical.data || []).map((r) => ({ ...r, source: 'consult', kind: 'Surgical report', date: r.performed_at || visitDate[r.visit_id], href: `/consults/${r.visit_id}` })),
    ...(ultrasound.data || []).map((r) => ({ ...r, source: 'consult', kind: 'Ultrasound report', date: r.performed_at || visitDate[r.visit_id], href: `/consults/${r.visit_id}` })),
    ...(xray.data || []).map((r) => ({ ...r, source: 'consult', kind: 'X-ray report', date: r.performed_at || visitDate[r.visit_id], href: `/consults/${r.visit_id}` })),
    ...(diagnostics.data || []).map((r) => ({ ...r, source: 'consult', kind: r.type || 'Diagnostic test', date: r.created_at, href: `/consults/${r.visit_id}` })),
    ...(hospReports.data || []).map((r) => ({ ...r, source: 'hospitalization', kind: `${r.report_type} report`, date: r.created_at, href: `/hospitalization/${r.hospitalization_id}` })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return NextResponse.json(rows);
}
