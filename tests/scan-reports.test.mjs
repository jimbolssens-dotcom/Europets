import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanKind, reportForTest } from '../lib/scanReports.js';

test('scan kinds match the database function', () => {
  assert.equal(scanKind('Ultrasound with Report'), 'ultrasound');
  assert.equal(scanKind('X-ray second'), 'xray');
  assert.equal(scanKind('Radiograph thorax'), 'xray');
  assert.equal(scanKind('Gastroscopy'), 'gastroscopy');
  assert.equal(scanKind('Bloods GHP'), null);
});

test('an X-ray second view opens the report of its first view, same day only', () => {
  const reports = [
    { id: 'r1', diagnostic_id: 'd1', performed_at: '2026-11-19T05:00:00Z' },
    { id: 'r0', diagnostic_id: 'd0', performed_at: '2026-11-17T05:00:00Z' },
  ];
  assert.equal(reportForTest({ id: 'd1', created_at: '2026-11-19T05:00:00Z' }, reports).id, 'r1');
  assert.equal(reportForTest({ id: 'd2', created_at: '2026-11-19T05:02:00Z' }, reports).id, 'r1');
  assert.equal(reportForTest({ id: 'd9', created_at: '2026-11-18T05:00:00Z' }, reports), null);
  // 23:30 on the 18th in Dubai is still the 19th there
  assert.equal(reportForTest({ id: 'd3', created_at: '2026-11-18T20:30:00Z' }, reports).id, 'r1');
});
