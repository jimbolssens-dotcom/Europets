import test from 'node:test';
import assert from 'node:assert/strict';
import { dayProcedureDate } from '../lib/dayProcedureSchedule.js';

// 10 Nov: a castration booked the evening before (admitted 9 Nov 17:43 UAE
// to wait overnight, scheduled_for 10 Nov) was missing from the day
// procedures wall, which went by the admission date.
test('a day procedure booked the day before belongs to its procedure day', () => {
  assert.equal(dayProcedureDate({ admitted_at: '2026-11-09T13:43:38Z', scheduled_for: '2026-11-10' }), '2026-11-10');
});

test('a same-day procedure is dated in UAE time, even before 4:00', () => {
  assert.equal(dayProcedureDate({ admitted_at: '2026-11-09T21:30:00Z' }), '2026-11-10'); // 01:30 UAE
  assert.equal(dayProcedureDate({ admitted_at: '2026-11-10T05:00:00Z' }), '2026-11-10');
});
