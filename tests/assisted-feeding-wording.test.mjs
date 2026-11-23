import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmpathicCheckinText } from '../lib/hospitalizationCheckin.js';

test('a logged syringe feed reads clinically, with ml, food and kcal', () => {
  const text = buildEmpathicCheckinText({ feed_kind: 'forced', feed_ml: 7.5, feed_food: 'rc_recovery_liquid', feed_kcal: 7.5, force_feeding_done: 'done' }, 'Rudolph');
  assert.match(text, /Assisted feeding by syringe: 7\.5 ml of Royal Canin Recovery Liquid \(7\.5 kcal\)/);
  assert.doesNotMatch(text, /helped|hand-feeding/);
});

test('a check-in tick without an amount still says it plainly', () => {
  assert.match(buildEmpathicCheckinText({ force_feeding_done: 'done' }, 'Rudolph'), /Assisted feeding by syringe was given/);
});
