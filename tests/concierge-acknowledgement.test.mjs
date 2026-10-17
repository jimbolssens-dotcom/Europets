import test from 'node:test';
import assert from 'node:assert/strict';
import { isAcknowledgementOnly } from '../lib/clientAcknowledgement.js';

// Used for the fallback when the AI fails: a plain thank-you gets no
// fallback line, a real answer does.
test('a thank-you with a time, date or amount in it is an answer', () => {
  for (const t of ['Thanks 10:30', 'Ok 5pm', 'ok thanks, the 23rd']) assert.equal(isAcknowledgementOnly(t), false, t);
  for (const t of ['Thanks', 'Ok...thank you so much 🩷', '🩷']) assert.equal(isAcknowledgementOnly(t), true, t);
});
