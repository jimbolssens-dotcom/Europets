// lib/scanReports.js
// Ultrasound, x-ray and gastroscopy: "one scan, one report card, the same
// everywhere" (Jim, 19 Nov). Every scan test (a diagnostics row) gets its
// report from the database itself (migration 256's trigger), whichever
// screen logged it; this file is the shared vocabulary for the screens
// and routes: which kind of scan a test is, where its report lives, and
// which report a test line opens.

import { isUltrasoundTest } from './ultrasoundProduct.js';
import { isXrayTest } from './xrayProduct.js';
import { isGastroscopyTest } from './gastroscopyProduct.js';

export const SCAN_KINDS = {
  ultrasound: { label: 'Ultrasound', icon: '🔊', apiBase: '/api/ultrasound-reports', entityType: 'ultrasound_report', table: 'ultrasound_reports', anchor: 'report-ultrasound' },
  xray: { label: 'X-ray', icon: '🩻', apiBase: '/api/xray-reports', entityType: 'xray_report', table: 'xray_reports', anchor: 'report-xray' },
  gastroscopy: { label: 'Gastroscopy', icon: '🔬', apiBase: '/api/gastroscopy-reports', entityType: 'gastroscopy_report', table: 'gastroscopy_reports', anchor: 'report-gastroscopy' },
};

// Same order as migration 256's scan_report_kind().
export function scanKind(testName) {
  if (isUltrasoundTest(testName)) return 'ultrasound';
  if (isGastroscopyTest(testName)) return 'gastroscopy';
  if (isXrayTest(testName)) return 'xray';
  return null;
}

function uaeDay(ts) {
  return ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }) : null;
}

// The report a scan test line opens: its own (diagnostic_id), else the
// report of the same kind started on the case that day (an "X-ray second"
// view shares the report of its "X-ray first"; see migration 256).
export function reportForTest(test, reports) {
  const list = reports || [];
  const own = list.find((r) => r.diagnostic_id === test.id);
  if (own) return own;
  const day = uaeDay(test.created_at);
  return list.find((r) => uaeDay(r.performed_at || r.created_at) === day) || null;
}

// The DOM id of a report card, so "Open … report" links can jump to it.
export function scanReportAnchor(kind, reportId) {
  return `scan-report-${kind}-${reportId}`;
}

const newest = (list) =>
  [...list].sort((a, b) => new Date(b.performed_at || b.created_at) - new Date(a.performed_at || a.created_at))[0];

// The report to open for a scan on one consult or stay: the newest one not
// written yet, else the newest, else a new one (just the report: billing
// goes with the test, which then joins this report, migration 256).
export async function findOrStartScanReport(kind, { visitId, hospitalizationId }) {
  const meta = SCAN_KINDS[kind];
  const query = visitId ? `visit_id=${visitId}` : `hospitalization_id=${hospitalizationId}`;
  const list = await fetch(`${meta.apiBase}?${query}`).then((res) => res.json()).catch(() => []);
  const reports = Array.isArray(list) ? list : [];
  const found = newest(reports.filter((r) => !r.ai_summary)) || newest(reports);
  if (found) return found;
  const res = await fetch(meta.apiBase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(visitId ? { visit_id: visitId } : { hospitalization_id: hospitalizationId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Could not start the ${meta.label.toLowerCase()} report`);
  return data;
}

// The test lines ({ id, name }) a report covers, for its card.
export function testsForReport(report, kind, diagnostics, reports, nameOf) {
  return (diagnostics || [])
    .filter((d) => scanKind(nameOf(d)) === kind && reportForTest(d, reports)?.id === report.id)
    .map((d) => ({ id: d.id, name: nameOf(d) }));
}
