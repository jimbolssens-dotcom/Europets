// The dose bar on a daily hospital task (lib/doseCourse.js, migration 253).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doseCourse, densityFor, cleanCourseDays } from '../lib/doseCourse.js';

test('twice daily, 5-day course, day 3: given, a missed evening, today half done', () => {
  const c = doseCourse({ frequency: 'twice_daily', startDate: '2026-11-13', today: '2026-11-15', courseDays: 5, countsByDate: { '2026-11-13': 2, '2026-11-14': 1, '2026-11-15': 1 } });
  assert.equal(c.label, 'Day 3 of 5');
  assert.deepEqual(c.days.map((d) => d.doses), [
    ['given', 'given'], ['given', 'missed'], ['given', 'due'], ['future', 'future'], ['future', 'future'],
  ]);
});

test('once daily, last day of the course', () => {
  const c = doseCourse({ frequency: 'once_daily', startDate: '2026-11-13', today: '2026-11-15', courseDays: 3, countsByDate: { '2026-11-13': 1, '2026-11-14': 1 } });
  assert.equal(c.label, 'Day 3 of 3 · last');
  assert.deepEqual(c.days.map((d) => d.doses[0]), ['given', 'given', 'due']);
});

test('open-ended grows a block a day; past the course keeps going', () => {
  const open = doseCourse({ frequency: 'once_daily', startDate: '2026-10-07', today: '2026-11-15' });
  assert.equal(open.total, 40);
  assert.equal(open.label, 'Day 40');
  const over = doseCourse({ frequency: 'once_daily', startDate: '2026-11-10', today: '2026-11-15', courseDays: 5 });
  assert.equal(over.total, 6);
  assert.equal(over.label, 'Day 6 · course was 5');
  assert.equal(over.over, true);
});

test('one-off tasks get no bar', () => {
  assert.equal(doseCourse({ frequency: 'one_time', startDate: '2026-11-15', today: '2026-11-15' }), null);
});

test('more days draw thinner', () => {
  assert.equal(densityFor(7), 'normal');
  assert.equal(densityFor(20), 'dense');
  assert.equal(densityFor(40), 'tight');
});

test('course length from a form', () => {
  assert.deepEqual(cleanCourseDays(''), { value: null });
  assert.deepEqual(cleanCourseDays('7'), { value: 7 });
  assert.ok(cleanCourseDays(0).error);
  assert.ok(cleanCourseDays(2.5).error);
  assert.ok(cleanCourseDays(500).error);
});
