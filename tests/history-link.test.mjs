import test from 'node:test';
import assert from 'node:assert/strict';
import { historyLinkQuery, historyLinkValid } from '../lib/historyLink.js';

const key = 'test-key';
const now = Date.parse('2026-10-19T08:00:00Z');

test('a history link works for its own patient for 30 days, then stops', () => {
  const q = new URLSearchParams(historyLinkQuery('pet-1', { now, key }));
  const exp = q.get('exp');
  const sig = q.get('sig');
  assert.equal(historyLinkValid('pet-1', exp, sig, { now, key }), true);
  assert.equal(historyLinkValid('pet-1', exp, sig, { now: now + 29 * 86400000, key }), true);
  assert.equal(historyLinkValid('pet-1', exp, sig, { now: now + 31 * 86400000, key }), false);
  assert.equal(historyLinkValid('pet-2', exp, sig, { now, key }), false); // another pet
  assert.equal(historyLinkValid('pet-1', String(Number(exp) + 86400 * 365), sig, { now, key }), false); // stretched expiry
  assert.equal(historyLinkValid('pet-1', exp, sig, { now, key: 'other' }), false);
  assert.equal(historyLinkValid('pet-1', null, null, { now, key }), false);
});
