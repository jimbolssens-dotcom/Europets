import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Each report type now lives in one table shared by consults and
// hospitalizations (see migration 085) — a row's visit_id or
// hospitalization_id says which record it belongs to and where its
// "Open record" link goes.
async function fetchByPatient(table, columns, visitIds, hospIds) {
  if (!visitIds.length && !hospIds.length) return [];
  let query = supabase.from(table).select(columns);
  query = visitIds.length && hospIds.length
    ? query.or(`visit_id.in.(${visitIds.join(',')}),hospitalization_id.in.(${hospIds.join(',')})`)
    : visitIds.length
      ? query.in('visit_id', visitIds)
      : query.in('hospitalization_id', hospIds);
  const { data } = await query;
  return data || [];
}

function recordHref(row) {
  return row.visit_id ? `/consults/${row.visit_id}` : `/hospitalization/${row.hospitalization_id}`;
}

export async function GET(request, { params }) {
  const { data: visits } = await supabase.from('visits').select('id, started_at, ai_summary').eq('patient_id', params.id);
  const { data: hospitalizations } = await supabase.from('hospitalizations').select('id, admitted_at, ai_summary').eq('patient_id', params.id);
  const visitIds = (visits || []).map((v) => v.id);
  const hospIds = (hospitalizations || []).map((h) => h.id);
  const [dental, surgical, ultrasound, xray, diagnostics] = await Promise.all([
    fetchByPatient('dental_reports', 'id, visit_id, hospitalization_id, performed_at, ai_summary, findings', visitIds, hospIds),
    fetchByPatient('surgical_reports', 'id, visit_id, hospitalization_id, performed_at, ai_summary, procedure_name, notes', visitIds, hospIds),
    fetchByPatient('ultrasound_reports', 'id, visit_id, hospitalization_id, performed_at, ai_summary, findings', visitIds, hospIds),
    fetchByPatient('xray_reports', 'id, visit_id, hospitalization_id, performed_at, ai_summary, findings', visitIds, hospIds),
    fetchByPatient('diagnostics', 'id, visit_id, hospitalization_id, created_at, type, result, goods_services(name)', visitIds, hospIds),
  ]);
  const visitDate = Object.fromEntries((visits || []).map((v) => [v.id, v.started_at]));
  const hospDate = Object.fromEntries((hospitalizations || []).map((h) => [h.id, h.admitted_at]));
  const recordDate = (r) => (r.visit_id ? visitDate[r.visit_id] : hospDate[r.hospitalization_id]);
  const rows = [
    ...(visits || []).filter((v) => v.ai_summary).map((v) => ({ id: `consult-${v.id}`, source: 'consult', kind: 'Consult report', date: v.started_at, ai_summary: v.ai_summary, href: `/consults/${v.id}` })),
    ...(hospitalizations || []).filter((h) => h.ai_summary).map((h) => ({ id: `hospitalization-${h.id}`, source: 'hospitalization', kind: 'Hospitalization report', date: h.admitted_at, ai_summary: h.ai_summary, href: `/hospitalization/${h.id}` })),
    ...dental.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: 'Dental report', date: r.performed_at || recordDate(r), href: recordHref(r) })),
    ...surgical.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: 'Surgical report', date: r.performed_at || recordDate(r), href: recordHref(r) })),
    ...ultrasound.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: 'Ultrasound report', date: r.performed_at || recordDate(r), href: recordHref(r) })),
    ...xray.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: 'X-ray report', date: r.performed_at || recordDate(r), href: recordHref(r) })),
    ...diagnostics.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: r.goods_services?.name || r.type || 'Diagnostic test', date: r.created_at, href: recordHref(r) })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return NextResponse.json(rows);
}
