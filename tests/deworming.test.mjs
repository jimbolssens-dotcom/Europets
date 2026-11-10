import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, lastDeworming, nextDewormingDue, dewormingReminderDue } from '../lib/deworming.js';

test('addMonths keeps the day, clamped to the month end', () => {
  assert.equal(addMonths('2026-11-08', 3), '2027-02-08');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
});

test('last deworming is the newer of the staff date and the invoice date', () => {
  assert.equal(lastDeworming('2026-05-01', '2026-09-10'), '2026-09-10');
  assert.equal(lastDeworming('2026-10-01', null), '2026-10-01');
  assert.equal(lastDeworming(null, null), null);
});

test('next due rolls on by the interval until it reaches today', () => {
  assert.equal(nextDewormingDue({ intervalMonths: 3, lastDate: '2026-11-08', today: '2026-11-08' }), '2027-02-08');
  assert.equal(nextDewormingDue({ intervalMonths: 3, lastDate: '2026-01-10', today: '2026-11-08' }), '2027-01-10');
  assert.equal(nextDewormingDue({ intervalMonths: 6, lastDate: '2026-05-08', today: '2026-11-08' }), '2026-11-08');
  assert.equal(nextDewormingDue({ intervalMonths: null, lastDate: '2026-05-08', today: '2026-11-08' }), null);
});

test('a reminder goes out once, 3 days before the due date', () => {
  const base = { intervalMonths: 3, lastDate: '2026-08-11' };
  assert.equal(dewormingReminderDue({ ...base, today: '2026-11-08' }), '2026-11-11');
  assert.equal(dewormingReminderDue({ ...base, today: '2026-11-07' }), null);
  assert.equal(dewormingReminderDue({ ...base, remindedFor: '2026-11-11', today: '2026-11-08' }), null);
});

test('a reminder turned off (0) never comes due', () => {
  assert.equal(nextDewormingDue({ intervalMonths: 0, lastDate: '2026-11-10', today: '2026-11-10' }), null);
  assert.equal(dewormingReminderDue({ intervalMonths: 0, lastDate: '2026-08-13', today: '2026-11-10' }), null);
});

test('the automatic 6-month reminder from a deworming logged today', () => {
  assert.equal(nextDewormingDue({ intervalMonths: 6, lastDate: '2026-11-10', today: '2026-11-10' }), '2027-05-10');
  assert.equal(dewormingReminderDue({ intervalMonths: 6, lastDate: '2026-11-10', today: '2027-05-07' }), '2027-05-10');
});
