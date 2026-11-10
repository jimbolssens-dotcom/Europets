// lib/patientReportOverview.js
// Every report and test on file for one patient, newest first: consult and
// hospitalization summaries, procedure reports (dental, surgical,
// ultrasound, x-ray, gastroscopy) and diagnostics. Shared by GET
// /api/patients/:id/report-overview (the Full Patient History page and the
// client app) and the history PDF sent to owners
// (app/api/patients/[id]/history-pdf), so both always show the same thing.

import { supabase } from '@/lib/supabaseClient';

// Each report type now lives in one table shared by consults and
// hospitalizations (see migration 085) — a row's visit_id or
// hospitalization_id says which record it belongs to and where its
// "Open record" link goes.
// .in() over a long id list is split into chunks so the request URL stays
// short (an owner with hundreds of pets, e.g. a rescuer).
const CHUNK = 120;
async function selectIn(table, columns, column, ids, extra) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    let query = supabase.from(table).select(columns).in(column, ids.slice(i, i + CHUNK));
    if (extra) query = extra(query);
    const { data } = await query;
    if (data) out.push(...data);
  }
  return out;
}

async function fetchByPatient(table, columns, visitIds, hospIds) {
  if (!visitIds.length && !hospIds.length) return [];
  const [byVisit, byHosp] = await Promise.all([
    visitIds.length ? selectIn(table, columns, 'visit_id', visitIds) : [],
    hospIds.length ? selectIn(table, columns, 'hospitalization_id', hospIds) : [],
  ]);
  const seen = new Set();
  return [...byVisit, ...byHosp].filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
}

function recordHref(row) {
  return row.visit_id ? `/consults/${row.visit_id}` : `/hospitalization/${row.hospitalization_id}`;
}

export async function patientReportRows(patientId) {
  return patientsReportRows([patientId]);
}

// The same for several patients at once (every pet of one owner, for the
// client app's home screen and Reports tab): one set of queries instead of
// one set per pet. Each row carries its patient_id.
export async function patientsReportRows(patientIds) {
  if (!patientIds?.length) return [];
  const [visits, hospitalizations] = await Promise.all([
    selectIn('visits', 'id, patient_id, started_at, ai_summary', 'patient_id', patientIds),
    selectIn('hospitalizations', 'id, patient_id, admitted_at, ai_summary', 'patient_id', patientIds),
  ]);
  const visitIds = (visits || []).map((v) => v.id);
  const hospIds = (hospitalizations || []).map((h) => h.id);
  const [dental, surgical, ultrasound, xray, gastroscopy, diagnostics] = await Promise.all([
    fetchByPatient('dental_reports', 'id, visit_id, hospitalization_id, performed_at, ai_summary, findings', visitIds, hospIds),
    fetchByPatient('surgical_reports', 'id, visit_id, hospitalization_id, performed_at, ai_summary, procedure_name, notes', visitIds, hospIds),
    fetchByPatient('ultrasound_reports', 'id, visit_id, hospitalization_id, performed_at, ai_summary, findings', visitIds, hospIds),
    fetchByPatient('xray_reports', 'id, visit_id, hospitalization_id, performed_at, ai_summary, findings', visitIds, hospIds),
    fetchByPatient('gastroscopy_reports', 'id, visit_id, hospitalization_id, performed_at, ai_summary, findings', visitIds, hospIds),
    fetchByPatient('diagnostics', 'id, visit_id, hospitalization_id, created_at, type, result, goods_services(name)', visitIds, hospIds),
  ]);
  // A test result attached as a lab PDF (not typed in): its file names, so
  // the client app says it's attached instead of "No result recorded yet"
  // and opens the lab's own PDF for that test (lib/clientAppReports.js).
  const diagnosticIds = diagnostics.map((d) => d.id);
  const diagnosticFiles = diagnosticIds.length
    ? (await selectIn('attachments', 'entity_id, file_name, content_type, created_at', 'entity_id', diagnosticIds, (q) => q.eq('entity_type', 'diagnostic'))).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      )
    : [];
  const labFilesByDiagnostic = {};
  for (const a of diagnosticFiles || []) {
    if (a.content_type !== 'application/pdf' && !/\.pdf$/i.test(a.file_name || '')) continue;
    (labFilesByDiagnostic[a.entity_id] ||= []).push(a.file_name || 'lab report');
  }
  const visitDate = Object.fromEntries((visits || []).map((v) => [v.id, v.started_at]));
  const hospDate = Object.fromEntries((hospitalizations || []).map((h) => [h.id, h.admitted_at]));
  const recordDate = (r) => (r.visit_id ? visitDate[r.visit_id] : hospDate[r.hospitalization_id]);
  const visitPatient = Object.fromEntries((visits || []).map((v) => [v.id, v.patient_id]));
  const hospPatient = Object.fromEntries((hospitalizations || []).map((h) => [h.id, h.patient_id]));
  const patientOf = (r) => (r.visit_id ? visitPatient[r.visit_id] : hospPatient[r.hospitalization_id]);
  const rows = [
    // For a consult/hospitalization row, "delete" clears the ai_summary
    // field rather than removing the visit/admission itself (mirrors
    // deleteConsultReport/deleteHospitalReport on those records' own
    // pages) — so recordId + editableField are enough for the UI to
    // both edit and "delete" (PATCH ai_summary: null) via PATCH alone.
    ...(visits || []).filter((v) => v.ai_summary).map((v) => ({ id: `consult-${v.id}`, source: 'consult', kind: 'Consult report', date: v.started_at, ai_summary: v.ai_summary, href: `/consults/${v.id}`, reportType: 'consult', apiBase: '/api/visits', recordId: v.id, editableField: 'ai_summary', deleteMode: 'clear' })),
    ...(hospitalizations || []).filter((h) => h.ai_summary).map((h) => ({ id: `hospitalization-${h.id}`, source: 'hospitalization', kind: 'Hospitalization report', date: h.admitted_at, ai_summary: h.ai_summary, href: `/hospitalization/${h.id}`, reportType: 'hospitalization', apiBase: '/api/hospitalizations', recordId: h.id, editableField: 'ai_summary', deleteMode: 'clear' })),
    ...dental.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: 'Dental report', date: r.performed_at || recordDate(r), href: recordHref(r), reportType: 'dental', apiBase: '/api/dental-reports', recordId: r.id, editableField: 'ai_summary', deleteMode: 'remove' })),
    ...surgical.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: 'Surgical report', date: r.performed_at || recordDate(r), href: recordHref(r), reportType: 'surgical', apiBase: '/api/surgical-reports', recordId: r.id, editableField: 'ai_summary', deleteMode: 'remove' })),
    ...ultrasound.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: 'Ultrasound report', date: r.performed_at || recordDate(r), href: recordHref(r), reportType: 'ultrasound', apiBase: '/api/ultrasound-reports', recordId: r.id, editableField: 'ai_summary', deleteMode: 'remove' })),
    ...xray.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: 'X-ray report', date: r.performed_at || recordDate(r), href: recordHref(r), reportType: 'xray', apiBase: '/api/xray-reports', recordId: r.id, editableField: 'ai_summary', deleteMode: 'remove' })),
    ...gastroscopy.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: 'Gastroscopy report', date: r.performed_at || recordDate(r), href: recordHref(r), reportType: 'gastroscopy', apiBase: '/api/gastroscopy-reports', recordId: r.id, editableField: 'ai_summary', deleteMode: 'remove' })),
    ...diagnostics.map((r) => ({ ...r, source: r.visit_id ? 'consult' : 'hospitalization', kind: r.goods_services?.name || r.type || 'Diagnostic test', date: r.created_at, lab_report_files: labFilesByDiagnostic[r.id] || [], href: recordHref(r), reportType: 'diagnostic', apiBase: '/api/diagnostics', recordId: r.id, editableField: 'result', deleteMode: 'remove' })),
  ]
    .map((r) => ({ ...r, patient_id: r.patient_id || patientOf(r) || (r.source === 'consult' ? visitPatient[r.recordId] : hospPatient[r.recordId]) }))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return rows;
}
