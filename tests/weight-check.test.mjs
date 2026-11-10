import test from 'node:test';
import assert from 'node:assert/strict';
import { weightJump, weightJumpMessage } from '../lib/weightCheck.js';

// 13 Oct: "286" typed for a cat weighed at 2.85 kg.
test('a typo like 286 for 2.86 kg is flagged', () => {
  assert.ok(weightJump(286, 2.85));
  assert.match(weightJumpMessage(286, 2.85), /100 times the last weight \(2\.85 kg\)/);
});

test('more than 10% either way is flagged, 10% or less is not', () => {
  assert.equal(weightJump(3.1, 2.85), null); // +8.8%
  assert.equal(weightJump(3.3, 3), null); // exactly +10%
  assert.deepEqual(weightJump(3.2, 2.85), { pct: 12, up: true, lastKg: 2.85 });
  assert.match(weightJumpMessage(2.5, 2.85), /12% less than the last weight/);
});

test('no last weight, nothing to compare', () => {
  assert.equal(weightJump(4, null), null);
  assert.equal(weightJump(4, 0), null);
  assert.equal(weightJump('', 3), null);
});
