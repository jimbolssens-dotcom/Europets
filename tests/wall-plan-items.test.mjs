import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uaeDate, wallItemsForToday } from '../lib/wallPlanItems.js';

test('today is the UAE date, not UTC', () => {
  // 30 Oct 21:30 UTC is already 31 Oct 01:30 in the UAE.
  assert.equal(uaeDate('2026-10-30T21:30:00Z'), '2026-10-31');
  assert.equal(uaeDate('2026-10-30T19:59:00Z'), '2026-10-30');
});

test("one-time items show only on the day they were added; daily ones every day", () => {
  const items = [
    { id: 'a', frequency: 'one_time', created_at: '2026-10-29T08:00:00Z' }, // yesterday
    { id: 'b', frequency: 'one_time', created_at: '2026-10-30T05:00:00Z' }, // today
    { id: 'c', frequency: 'once_daily', created_at: '2026-10-20T08:00:00Z' },
    { id: 'd', frequency: 'twice_daily', created_at: '2026-10-21T08:00:00Z' },
    { id: 'e', frequency: 'one_time', created_at: '2026-10-29T21:00:00Z' }, // 30 Oct 01:00 UAE
  ];
  assert.deepEqual(wallItemsForToday(items, '2026-10-30').map((i) => i.id), ['b', 'c', 'd', 'e']);
});
