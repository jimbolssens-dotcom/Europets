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
