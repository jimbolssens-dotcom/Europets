import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSocialConsent } from '../lib/socialConsent.js';

test('the tick starts ticked: unticking is a no, a ticked box never overrides a no on file', () => {
  assert.equal(nextSocialConsent(null, true), true);
  assert.equal(nextSocialConsent(true, true), undefined);
  assert.equal(nextSocialConsent(false, true), undefined); // staff turn a no back into a yes
  assert.equal(nextSocialConsent(null, false), false);
  assert.equal(nextSocialConsent(true, false), false); // unticking is deliberate
  assert.equal(nextSocialConsent(false, false), undefined);
  assert.equal(nextSocialConsent(true, undefined), undefined);
});
