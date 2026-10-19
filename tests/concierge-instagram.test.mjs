import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSituation } from '../lib/conciergeSituation.js';

const now = Date.parse('2026-10-19T08:00:00Z'); // 12:00 UAE, open

test('the concierge may invite a client to follow on Instagram only when allowed', () => {
  assert.match(describeSituation({ rows: [], now, mayInviteInstagram: true }), /instagram\.com\/europetsclinic/);
  assert.match(describeSituation({ rows: [], now, mayInviteInstagram: true }), /never when their pet is unwell/);
  assert.doesNotMatch(describeSituation({ rows: [], now }), /instagram/i);
  // Never while staff hold the conversation.
  assert.doesNotMatch(describeSituation({ rows: [], now, mayInviteInstagram: true, handedOver: true }), /instagram/i);
  assert.doesNotMatch(describeSituation({ rows: [], now, mayInviteInstagram: true, staffEngaged: true }), /instagram/i);
});
