import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consultToLink } from '../lib/admitConsultLink.js';

const today = '2026-11-20';
test('links the consult the patient is in today', () => {
  const visits = [{ id: 'v1', status: 'in_progress', started_at: '2026-11-20T07:27:26Z' }];
  assert.equal(consultToLink(visits, [], today), 'v1');
});
test('not a finished consult, not yesterday, not one already linked', () => {
  assert.equal(consultToLink([{ id: 'a', status: 'complete', started_at: '2026-11-20T07:00:00Z' }], [], today), null);
  assert.equal(consultToLink([{ id: 'b', status: 'in_progress', started_at: '2026-11-19T07:00:00Z' }], [], today), null);
  assert.equal(consultToLink([{ id: 'c', status: 'in_progress', started_at: '2026-11-20T07:00:00Z' }], ['c'], today), null);
});
test('the newest of two', () => {
  const visits = [
    { id: 'old', status: 'in_progress', started_at: '2026-11-20T05:00:00Z' },
    { id: 'new', status: 'in_progress', started_at: '2026-11-20T08:00:00Z' },
  ];
  assert.equal(consultToLink(visits, [], today), 'new');
});
