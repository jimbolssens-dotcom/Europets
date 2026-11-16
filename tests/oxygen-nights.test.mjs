// An oxygen cage night replaces that night's daily hospitalisation rate
// (lib/oxygenNights.js). Replays the four invoices found on 16 Nov.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oxygenNights } from '../lib/oxygenNights.js';

test('oxygen logged on the stay marks that night', () => {
  const nights = oxygenNights([
    { note_date: '2026-11-14', name: 'Oxygen Cage per day', billable: true },
    { note_date: '2026-11-15', name: 'Oxygen Cage per day', billable: true },
    { note_date: '2026-11-16', name: 'Hospitalisation - Cat (p/day)', billable: true },
  ]);
  assert.deepEqual([...nights].sort(), ['2026-11-14', '2026-11-15']);
});

test('oxygen charged at the consult marks the admission night (21 Oct case)', () => {
  const nights = oxygenNights(
    [{ note_date: '2026-10-21', name: 'Oxygen Cage per day', billable: false }],
    [{ created_at: '2026-10-21T06:55:00Z', name: 'Oxygen Cage per day — Hospitalized in oxygen cage', billable: true }]
  );
  assert.deepEqual([...nights], ['2026-10-21']);
});

test('an unbilled oxygen entry alone does not count', () => {
  assert.equal(oxygenNights([{ note_date: '2026-10-21', name: 'Oxygen Cage per day', billable: false }]).size, 0);
});
