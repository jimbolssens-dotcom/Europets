import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSocialConsent } from '../lib/socialConsent.js';

test('a tick adds a yes; an empty tick only records a no when nothing was on file', () => {
  assert.equal(nextSocialConsent(null, true), true);
  assert.equal(nextSocialConsent(false, true), true);
  assert.equal(nextSocialConsent(true, true), undefined);
  assert.equal(nextSocialConsent(null, false), false);
  assert.equal(nextSocialConsent(true, false), undefined); // a yes isn't taken back by skipping the tick
  assert.equal(nextSocialConsent(false, false), undefined);
  assert.equal(nextSocialConsent(true, undefined), undefined);
});
