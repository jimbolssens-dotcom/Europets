import test from 'node:test';
import assert from 'node:assert/strict';
import { unseenMessageLast } from '../lib/clientAcknowledgement.js';
import { earlierDayLabel } from '../lib/clinicHours.js';

const at = (uae) => `${uae}+04:00`;
const row = (sender, uae, body, extra = {}) => ({ sender, created_at: at(uae), body, ...extra });

// a147856b, 24 Oct: the question arrived a second before the reply to "Hi"
// went out, and its own run then read the thread as answered.
const payment = [
  row('client', '2026-10-24T13:33:58', 'Hi', { wa_message_id: 'w1' }),
  row('client', '2026-10-24T13:34:03', 'GA', { wa_message_id: 'w2' }),
  row('client', '2026-10-24T13:34:12', 'Did u receive the payment?', { wa_message_id: 'w3' }),
  row('ai', '2026-10-24T13:34:13', 'Hi, good afternoon! How can I help you today?'),
];

test('a question that arrived while a reply was going out is still answered', () => {
  const rows = unseenMessageLast(payment, 'w3');
  assert.equal(rows[rows.length - 1].body, 'Did u receive the payment?');
  assert.equal(rows[rows.length - 2].sender, 'ai');
  assert.equal(rows.length, payment.length);
});

test('nothing moves when the message is already the latest, or staff came after it', () => {
  assert.deepEqual(unseenMessageLast(payment.slice(0, 3), 'w3').map((r) => r.body), ['Hi', 'GA', 'Did u receive the payment?']);
  const staffAfter = [...payment.slice(0, 3), row('staff', '2026-10-24T13:35:00', 'Yes, received, thank you')];
  assert.equal(unseenMessageLast(staffAfter, 'w3'), staffAfter);
  const noticeAfter = [...payment.slice(0, 3), row('ai', '2026-10-24T13:34:20', "I've passed this to the team.", { is_notice: true })];
  assert.equal(unseenMessageLast(noticeAfter, 'w3'), noticeAfter);
  assert.equal(unseenMessageLast(payment, null), payment);
});

// 965bbf05, 24 to 25 Oct: "Can we come tomorrow at 1 pm?" at 20:33, and
// the next morning the AI passed on "coming in tomorrow at 1pm".
test('a message from an earlier day says when it was sent', () => {
  const now = Date.parse(at('2026-10-25T09:34:10'));
  assert.equal(earlierDayLabel(at('2026-10-24T20:33:34'), now), 'Sat 24 Oct, 20:33');
  assert.equal(earlierDayLabel(at('2026-10-25T09:34:06'), now), null);
});

test('days are UAE days, not UTC ones', () => {
  // 01:00 UAE is still the evening before in UTC.
  const now = Date.parse(at('2026-10-25T01:30:00'));
  assert.equal(earlierDayLabel(at('2026-10-25T00:20:00'), now), null);
  assert.equal(earlierDayLabel(at('2026-10-24T23:50:00'), now), 'Sat 24 Oct, 23:50');
});
