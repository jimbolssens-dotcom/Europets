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

// Every other day (migration 255).
import { dueOn, wallItemsForToday } from '../lib/wallPlanItems.js';

test('every other day is due on the day added, then every second day', () => {
  const item = { frequency: 'every_other_day', created_at: '2026-11-13T05:00:00Z' }; // 13 Nov UAE
  assert.deepEqual(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'].map((d) => dueOn(item, d)), [true, false, true, false, true]);
  assert.equal(dueOn({ frequency: 'once_daily', created_at: '2026-11-13T05:00:00Z' }, '2026-11-14'), true);
  assert.deepEqual(wallItemsForToday([item, { frequency: 'once_daily' }], '2026-11-14').length, 1);
});

test('its dose bar leaves the days in between empty', () => {
  const c = doseCourse({ frequency: 'every_other_day', startDate: '2026-11-13', today: '2026-11-17', courseDays: 7, countsByDate: { '2026-11-13': 1, '2026-11-15': 1 } });
  assert.deepEqual(c.days.map((d) => (d.off ? 'off' : d.doses[0])), ['given', 'off', 'given', 'off', 'due', 'off', 'future']);
  assert.equal(c.label, 'Day 5 of 7');
});
