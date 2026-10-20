import test from 'node:test';
import assert from 'node:assert/strict';
import { reportPdfHref, reportText } from '../lib/clientAppReports.js';

test('a test with a lab PDF opens the lab PDF itself in the client app', () => {
  const bloods = { reportType: 'diagnostic', recordId: 'd1', visit_id: 'v1', lab_report_files: ['Sammy - 14053.pdf'], result: null };
  assert.match(reportPdfHref(bloods), /^\/api\/diagnostics\/d1\/lab-pdf\?v=\d+$/);
  assert.match(reportText(bloods), /Lab report attached \(Sammy - 14053\.pdf\)/);
});

test('a typed-in test result still opens the combined test report', () => {
  const typed = { reportType: 'diagnostic', recordId: 'd2', visit_id: 'v1', lab_report_files: [], result: 'Normal' };
  assert.match(reportPdfHref(typed), /^\/api\/visits\/v1\/test-report-pdf\?v=\d+$/);
  const stay = { reportType: 'diagnostic', recordId: 'd3', hospitalization_id: 'h1', lab_report_files: [] };
  assert.match(reportPdfHref(stay), /^\/api\/hospitalizations\/h1\/test-report-pdf\?v=\d+$/);
});
