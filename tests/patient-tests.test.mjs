import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testHistoryRows, testKind } from '../lib/patientTests.js';

const rows = [
  { id: 'consult-1', reportType: 'consult', kind: 'Consult report', date: '2026-11-01', visit_id: null },
  { id: 's1', reportType: 'surgical', kind: 'Surgical report', date: '2026-11-02', visit_id: 'v1' },
  { id: 'x1', reportType: 'xray', kind: 'X-ray report', date: '2026-10-05', visit_id: 'v1' },
  { id: 'd1', reportType: 'diagnostic', kind: 'X-ray first', date: '2026-10-05', visit_id: 'v1', result: null },
  { id: 'd2', reportType: 'diagnostic', kind: 'X-ray second', date: '2026-10-05', visit_id: 'v1', result: 'Thorax clear' },
  { id: 'd3', reportType: 'diagnostic', kind: 'X-ray first', date: '2026-09-01', visit_id: 'v2', result: null },
  { id: 'd4', reportType: 'diagnostic', kind: 'Bloods GHP', date: '2026-11-10', hospitalization_id: 'h1', lab_report_files: ['lab.pdf'] },
  { id: 'u1', reportType: 'ultrasound', kind: 'Ultrasound report', date: '2026-08-01', hospitalization_id: 'h1' },
];

test('only tests and imaging, newest first, report not listed twice', () => {
  assert.deepEqual(testHistoryRows(rows).map((r) => r.id), ['d4', 'x1', 'd2', 'd3', 'u1']);
});

test('kinds', () => {
  assert.equal(testKind({ reportType: 'diagnostic', kind: 'Bloods - CBC' }), 'blood');
  assert.equal(testKind({ reportType: 'diagnostic', kind: 'Ultrasound with Report' }), 'ultrasound');
  assert.equal(testKind({ reportType: 'diagnostic', kind: 'Urine Strip with SG' }), 'urine');
  assert.equal(testKind({ reportType: 'diagnostic', kind: 'FIV/FeLV Test' }), 'other');
  assert.equal(testKind({ reportType: 'xray' }), 'xray');
});
