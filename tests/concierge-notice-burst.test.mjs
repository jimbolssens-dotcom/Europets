import test from 'node:test';
import assert from 'node:assert/strict';
import { secondNoticeAllowed } from '../lib/clientAcknowledgement.js';

const at = (uae) => `${uae}+04:00`;
const row = (sender, uae, body, extra = {}) => ({ sender, created_at: at(uae), body, ...extra });

// 7f2568f4, 26 Oct 17:33: "Do you have payment link so we will pay", then
// a minute later "And would love if you give us more discount": two
// "passed to the team" notices in a row. Same on 27 Oct 16:45/16:48.
test('no second notice a minute after the first', () => {
  const rows = [
    row('client', '2026-10-26T17:33:00', 'Great, do you have a payment link so we can pay?'),
    row('ai', '2026-10-26T17:33:20', "I've passed your request for a payment link to the team.", { is_notice: true }),
    row('client', '2026-10-26T17:34:00', 'And would love if you give us more discount'),
  ];
  assert.equal(secondNoticeAllowed(rows, Date.parse(at('2026-10-26T17:34:10'))), false);
});

test('a new question long after the first notice still gets one more', () => {
  const rows = [
    row('client', '2026-10-26T17:33:00', 'Great, do you have a payment link so we can pay?'),
    row('ai', '2026-10-26T17:33:20', "I've passed your request for a payment link to the team.", { is_notice: true }),
    row('client', '2026-10-26T18:10:00', 'Is the cat ready to go home?'),
  ];
  assert.equal(secondNoticeAllowed(rows, Date.parse(at('2026-10-26T18:10:10'))), true);
});
