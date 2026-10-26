import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSituation } from '../lib/conciergeSituation.js';

const at = (uae) => `${uae}+04:00`;
const row = (sender, uae, body, extra = {}) => ({ sender, created_at: at(uae), body, ...extra });

// 42ffe92e, 25 Oct: staff confirmed a 5:15pm consult; 40 minutes later
// "Can you send me the location" got nothing until staff sent it at 11:47.
const location = [
  row('client', '2026-10-25T10:05:00', 'Hi I filled it now, can you check'),
  row('ai', '2026-10-25T10:05:10', "Thank you! I've passed it to our team to check.", { is_notice: true }),
  row('staff', '2026-10-25T10:37:00', 'As per our call, does 5:15pm work for you later this afternoon with Dr Dalma?'),
  row('client', '2026-10-25T11:17:00', 'That’s great thanks see you then'),
  row('client', '2026-10-25T11:17:20', 'Can you send me the location'),
];

test('with staff in the thread, the address and what is booked can still be answered', () => {
  const s = describeSituation({ rows: location, now: Date.parse(at('2026-10-25T11:17:30')), staffEngaged: true });
  assert.match(s, /last wrote 41 minutes ago/);
  assert.match(s, /the address, opening hours/);
  assert.match(s, /what's booked and when/);
  assert.doesNotMatch(s, /Don't answer or book anything yourself/);
});

test('with staff in the thread, everything else is still left to them', () => {
  const s = describeSituation({ rows: location, now: Date.parse(at('2026-10-25T11:17:30')), staffEngaged: true });
  assert.match(s, /Don't book, move or cancel anything/);
  assert.match(s, /medical or about money/);
  assert.match(s, /never repeat, add to or contradict what they've said/);
});
