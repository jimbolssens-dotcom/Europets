import test from 'node:test';
import assert from 'node:assert/strict';
import { caseFamily } from '../lib/caseFamily.js';

// consult V1 -> day procedure D (originating_visit_id V1) -> stay H (originating_hospitalization_id D)
const rows = [
  { id: 'D', originating_visit_id: 'V1', originating_hospitalization_id: null },
  { id: 'H', originating_visit_id: null, originating_hospitalization_id: 'D' },
  { id: 'X', originating_visit_id: 'V9', originating_hospitalization_id: null },
];
const db = {
  from: () => ({
    select: () => ({
      in: async (col, ids) => ({ data: rows.filter((r) => ids.includes(r[col])) }),
    }),
  }),
};
const sorted = (f) => ({ visitIds: [...f.visitIds].sort(), hospitalizationIds: [...f.hospitalizationIds].sort() });

test('from the consult, the day procedure and the stay it became', async () => {
  assert.deepEqual(sorted(await caseFamily(db, { visitId: 'V1' })), { visitIds: ['V1'], hospitalizationIds: ['D', 'H'] });
});

test('from the stay, back to the day procedure and the consult', async () => {
  assert.deepEqual(sorted(await caseFamily(db, { hospitalizationId: 'H' })), { visitIds: ['V1'], hospitalizationIds: ['D', 'H'] });
});

test('an unrelated case stays out', async () => {
  assert.deepEqual(sorted(await caseFamily(db, { hospitalizationId: 'X' })), { visitIds: ['V9'], hospitalizationIds: ['X'] });
});
