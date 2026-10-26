import test from 'node:test';
import assert from 'node:assert/strict';
import { ageInMonths, openPrimaryCourse, defaultVaccineTicks } from '../lib/vaccinationCourse.js';

const PCH = { id: 'pch', core: true, is_rabies: false, interval_months: 12 };
const RAB = { id: 'rab', core: true, is_rabies: true, interval_months: 12 };
const protocols = [PCH, RAB];

test('age in whole months on the day', () => {
  assert.equal(ageInMonths('2026-08-10', '2026-10-09'), 1);
  assert.equal(ageInMonths('2026-08-10', '2026-10-10'), 2);
  assert.equal(ageInMonths('2026-07-26', '2026-10-26'), 3);
  assert.equal(ageInMonths(null, '2026-10-26'), null);
});

test('first vaccination at 2 months: the core vaccine only, rabies waits', () => {
  assert.deepEqual(defaultVaccineTicks({ protocols, vaccinations: [], dateOfBirth: '2026-08-20', dateGiven: '2026-10-26' }), ['pch']);
});

test('first vaccination at 3 months or older: rabies goes in too', () => {
  assert.deepEqual(defaultVaccineTicks({ protocols, vaccinations: [], dateOfBirth: '2026-07-20', dateGiven: '2026-10-26' }), ['pch', 'rab']);
});

test('no birth date, or doses already on file: nothing is assumed about rabies', () => {
  assert.deepEqual(defaultVaccineTicks({ protocols, vaccinations: [], dateOfBirth: null, dateGiven: '2026-10-26' }), ['pch']);
  const old = [{ id: 'a', vaccine_protocol_id: 'pch', date_given: '2025-10-01', is_primary: false }];
  assert.deepEqual(defaultVaccineTicks({ protocols, vaccinations: old, dateOfBirth: '2024-01-01', dateGiven: '2026-10-26' }), []);
});

// A 2-month-old's Primary visit: PCH given (booster in a month) and a rabies
// reminder for the booster date.
const young = [
  { id: 'c1', vaccine_protocol_id: 'pch', date_given: '2026-10-01', next_due_date: '2026-11-01', is_primary: true },
  { id: 'r1', vaccine_protocol_id: 'rab', date_given: null, next_due_date: '2026-11-01', is_primary: true },
];

test('the booster visit finds its primary course, with rabies to fill in', () => {
  const course = openPrimaryCourse(young, protocols, '2026-11-01');
  assert.equal(course.course.id, 'c1');
  assert.equal(course.boosterDue, '2026-11-01');
  assert.equal(course.rabiesReminder.id, 'r1');
  assert.deepEqual(defaultVaccineTicks({ protocols, vaccinations: young, dateOfBirth: '2026-08-01', dateGiven: '2026-11-01', openCourse: course }), ['pch', 'rab']);
});

test('3 months or older at the first visit: the booster is the core vaccine only', () => {
  const older = [
    { id: 'c2', vaccine_protocol_id: 'pch', date_given: '2026-10-01', next_due_date: '2026-11-01', is_primary: true },
    { id: 'r2', vaccine_protocol_id: 'rab', date_given: '2026-10-01', next_due_date: '2027-10-01', is_primary: true },
  ];
  const course = openPrimaryCourse(older, protocols, '2026-11-01');
  assert.equal(course.rabiesReminder, null);
  assert.deepEqual(defaultVaccineTicks({ protocols, vaccinations: older, dateOfBirth: '2026-06-01', dateGiven: '2026-11-01', openCourse: course }), ['pch']);
});

test('once the booster is linked, the course is closed', () => {
  const boosted = [...young, { id: 'b1', vaccine_protocol_id: 'pch', date_given: '2026-11-01', next_due_date: '2027-11-01', is_primary: false, booster_of: 'c1' }];
  assert.equal(openPrimaryCourse(boosted, protocols, '2026-11-02'), null);
});

test('a primary visit from long ago no longer waits on a booster', () => {
  assert.equal(openPrimaryCourse(young, protocols, '2027-03-01'), null);
});
