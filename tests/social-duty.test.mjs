import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDutyStaff, pickDutyIdea, dutyStep, FALLBACK_IDEAS } from '../lib/socialDutyRules.js';

const staff = [
  { id: 'v1', full_name: 'Dr. Anna', role: 'vet', active: true },
  { id: 'v2', full_name: 'Dr. Ben', role: 'vet', active: true },
  { id: 't1', full_name: 'Cara', role: 'tech', active: true },
  { id: 'r1', full_name: 'Dana', role: 'reception', active: true },
  { id: 'd1', full_name: 'Driver', role: 'driver', active: true },
  { id: 'c1', full_name: 'Cleaner', role: 'cleaner', active: true },
  { id: 'x1', full_name: 'Gone', role: 'vet', active: false },
];

test('the duty goes to whoever working today has waited longest, never drivers or cleaners', () => {
  const rostered = new Set(['v1', 'v2', 't1', 'd1', 'c1']);
  const last = new Map([['v1', '2026-10-18'], ['v2', '2026-10-12'], ['t1', '2026-10-15']]);
  assert.equal(pickDutyStaff(staff, rostered, last).id, 'v2');
  // Never had a turn beats everyone; reception isn't rostered today, so not them.
  assert.equal(pickDutyStaff(staff, new Set(['v1', 'r1', 'd1']), last).id, 'r1');
  // Only drivers and cleaners working: falls back to anyone eligible.
  assert.ok(['v1', 'v2', 't1', 'r1'].includes(pickDutyStaff(staff, new Set(['d1', 'c1']), last).id));
  // Passing it on skips the person who passed.
  assert.notEqual(pickDutyStaff(staff, rostered, last, ['v2']).id, 'v2');
  assert.equal(pickDutyStaff([{ id: 'd1', role: 'driver' }], new Set(['d1']), new Map()), null);
});

test("today's idea comes from the week's plan, else a ready-made one", () => {
  const plan = { week_start: '2026-10-19', ideas: [{ title: 'Dental day', day: 'Monday' }, { title: 'Cattery', day: 'Wednesday' }] };
  assert.equal(pickDutyIdea(plan, new Set(), 'Wednesday', 0).title, 'Cattery');
  assert.equal(pickDutyIdea(plan, new Set(), 'Wednesday', 0).plan_idea, '2026-10-19:1');
  assert.equal(pickDutyIdea(plan, new Set([1]), 'Wednesday', 0).title, 'Dental day'); // today's done: another one
  assert.equal(pickDutyIdea(plan, new Set([0, 1]), 'Friday', 2).title, FALLBACK_IDEAS[2].title);
  assert.equal(pickDutyIdea(null, new Set(), 'Friday', 0).plan_idea, null);
});

test('assign in the morning, nudge twice, tell the admin at six, stop once done', () => {
  assert.equal(dutyStep(8, null), 'assign');
  assert.equal(dutyStep(7, null), null);
  const duty = { reminders: 0, done_at: null, escalated_at: null };
  assert.equal(dutyStep(9, duty), null);
  assert.equal(dutyStep(12, duty), 'remind');
  assert.equal(dutyStep(12, { ...duty, reminders: 1 }), null);
  assert.equal(dutyStep(16, { ...duty, reminders: 1 }), 'remind');
  assert.equal(dutyStep(18, { ...duty, reminders: 2 }), 'escalate');
  assert.equal(dutyStep(18, { ...duty, reminders: 2, escalated_at: 'x' }), null);
  assert.equal(dutyStep(16, { ...duty, done_at: 'x' }), null);
});
