import test from 'node:test';
import assert from 'node:assert/strict';
import { rerKcal, forceFeedKcal, latestWeight, dailyIntake, weeklyIntake } from '../lib/feeding.js';

test('energy target is RER: 70 x kg^0.75', () => {
  assert.equal(rerKcal(3.2), 167);
  assert.equal(rerKcal(25), 783);
  assert.equal(rerKcal(0), null);
});

test('force feed kcal from ml and food', () => {
  assert.equal(forceFeedKcal(20, 'rc_recovery_liquid'), 20);
  assert.equal(forceFeedKcal(20, 'hills_ad'), 22);
  assert.equal(forceFeedKcal(20, 'unknown'), null);
  assert.equal(forceFeedKcal(0, 'hills_ad'), null);
});

test('the target follows the newest weight on the stay, else the file weight', () => {
  assert.equal(latestWeight([{ weight_kg: 3.0, created_at: '2026-11-01T08:00:00Z' }, { weight_kg: 3.2, created_at: '2026-11-03T08:00:00Z' }], 4), 3.2);
  assert.equal(latestWeight([], 4), 4);
  assert.equal(latestWeight([], null), null);
});

const notes = [
  { note_date: '2026-11-02', created_at: '2026-11-02T05:00:00Z', feed_kind: 'forced', feed_ml: 30, feed_food: 'rc_recovery_liquid', feed_kcal: 30 },
  { note_date: '2026-11-02', created_at: '2026-11-02T10:00:00Z', feed_kind: 'forced', feed_ml: 30, feed_food: 'rc_recovery_liquid', feed_kcal: 30 },
  { note_date: '2026-11-03', created_at: '2026-11-03T06:00:00Z', appetite: 'reduced', feed_kind: 'self' },
  // A cleaner's Quick Check-In appetite counts too; the day keeps its best.
  { note_date: '2026-11-03', created_at: '2026-11-03T12:00:00Z', appetite: 'good' },
];

test('one entry per day from admission to today, force feeding as % of target, best appetite', () => {
  const days = dailyIntake(notes, { targetKcal: 167, firstDay: '2026-11-01', today: '2026-11-04' });
  assert.deepEqual(days.map((d) => d.date), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  assert.equal(days[0].fedPct, 0);
  assert.equal(days[1].fedKcal, 60);
  assert.equal(days[1].fedPct, 36);
  assert.equal(days[1].feeds.length, 2);
  assert.equal(days[2].appetite, 'good');
  assert.equal(days[2].selfPct, 100);
  assert.equal(days[3].today, true);
});

test('a long stay groups into weeks of 7 days, each the average', () => {
  const many = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 8, 7 + i)).toISOString().slice(0, 10);
    many.push({ note_date: d, created_at: `${d}T06:00:00Z`, appetite: i < 30 ? 'none' : 'good' });
  }
  const days = dailyIntake(many, { targetKcal: 167, firstDay: '2026-09-07', today: '2026-11-05' });
  assert.equal(days.length, 60);
  const weeks = weeklyIntake(days);
  assert.equal(weeks.length, 9);
  assert.equal(weeks[0].selfPct, 0);
  assert.equal(weeks[8].selfPct, 100);
});
