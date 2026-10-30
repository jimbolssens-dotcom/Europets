import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitVaccineReminders } from '../lib/clientAppReminders.js';

// Fri 30 Oct 2026, 12:00 UAE.
const NOW = Date.parse('2026-10-30T08:00:00Z');
const row = (date, extra = {}) => ({ next_due_date: date, patients: { name: 'Ash', ...extra } });

test('only the next two weeks, or just overdue, show on the home', () => {
  const { soon, later } = splitVaccineReminders(
    [row('2026-11-07'), row('2026-11-13'), row('2026-11-14'), row('2026-10-16'), row('2026-10-15'), row('2026-11-25'), row('2024-03-01')],
    NOW
  );
  assert.deepEqual(soon.map((r) => r.next_due_date), ['2026-10-16', '2026-11-07', '2026-11-13']);
  assert.deepEqual(later.map((r) => r.next_due_date), ['2024-03-01', '2026-10-15', '2026-11-14', '2026-11-25']);
});

test('pets that died or were rehomed are left out', () => {
  const { soon, later } = splitVaccineReminders([row('2026-11-01', { deceased: true }), row('2026-11-01', { rehomed: true }), row('2026-11-01')], NOW);
  assert.equal(soon.length, 1);
  assert.equal(later.length, 0);
});
