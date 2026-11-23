import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachCageNames } from '../lib/clientInHospital.js';

test('open stays with their cage, newest first', () => {
  const out = attachCageNames(
    [{ id: 'a', cage_id: 'c1', admitted_at: '2026-11-20T08:00:00Z' }, { id: 'b', cage_id: null, admitted_at: '2026-11-22T08:00:00Z' }],
    [{ id: 'c1', name: 'ISO 2' }]
  );
  assert.deepEqual(out.map((s) => [s.id, s.cageName]), [['b', null], ['a', 'ISO 2']]);
});
