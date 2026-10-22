import test from 'node:test';
import assert from 'node:assert/strict';
import { stayDay, rescueStep, orderCaseMedia, isCollaboratorError, MAX_CASES_PER_POST } from '../lib/rescueUpdatesPlan.js';
import { rescueUpdateText } from '../lib/socialDraftPrompt.js';

test('the day they came in is day 1, by UAE dates', () => {
  assert.equal(stayDay('2026-10-22T05:00:00Z', '2026-10-22'), 1);
  assert.equal(stayDay('2026-09-29T10:00:00Z', '2026-10-22'), 24);
  // 23:30 UTC on the 21st is already the 22nd in the UAE.
  assert.equal(stayDay('2026-10-21T23:30:00Z', '2026-10-22'), 1);
});

test('the morning push once a day, the 4pm nudge only while photos are missing', () => {
  const partner = { active: true, pushed_on: null, nudged_on: null };
  const day = { partner, todayISO: '2026-10-22', cases: 6, photos: 0, drafted: false };
  assert.equal(rescueStep(7, day), null);
  assert.equal(rescueStep(8, day), 'push');
  assert.equal(rescueStep(12, { ...day, partner: { ...partner, pushed_on: '2026-10-22' } }), null);
  assert.equal(rescueStep(16, { ...day, photos: 4 }), 'nudge');
  assert.equal(rescueStep(16, { ...day, photos: 6 }), null);
  assert.equal(rescueStep(16, { ...day, drafted: true }), null);
  assert.equal(rescueStep(18, { ...day, partner: { ...partner, nudged_on: '2026-10-22' } }), null);
  assert.equal(rescueStep(8, { ...day, cases: 0 }), null);
  assert.equal(rescueStep(8, { ...day, partner: { ...partner, active: false } }), null);
});

test('one photo per animal, in case order, the retake wins, at most 10', () => {
  const media = [{ path: 'b1', patient_id: 'b' }, { path: 'a1', patient_id: 'a' }, { path: 'b2', patient_id: 'b' }, { path: 'x', patient_id: 'gone' }];
  assert.deepEqual(orderCaseMedia(media, ['a', 'b', 'c']).map((m) => m.path), ['a1', 'b2']);
  const many = Array.from({ length: 14 }, (_, k) => ({ path: `p${k}`, patient_id: `c${k}` }));
  assert.equal(orderCaseMedia(many, many.map((m) => m.patient_id)).length, MAX_CASES_PER_POST);
});

test('a refused collaborator invite is told apart from other errors', () => {
  assert.ok(isCollaboratorError(new Error('Invalid collaborators: the user cannot be tagged')));
  assert.ok(!isCollaboratorError(new Error('Media download has failed')));
});

test('the AI is told each animal, the day, and to tag and thank the rescue', () => {
  const text = rescueUpdateText({ handle: 'some_rescue', collab: true, in_hospital: 3, animals: [{ name: 'Mishmish', species: 'cat', day: 12, reason: 'Wound' }, null] }).join('\n');
  assert.match(text, /0: Mishmish, cat, day 12 with us/);
  assert.match(text, /1: one of their rescues/);
  assert.match(text, /as a collaboration with @some_rescue/);
  assert.match(text, /link in @some_rescue's bio/);
  assert.match(text, /no diagnoses/);
});
