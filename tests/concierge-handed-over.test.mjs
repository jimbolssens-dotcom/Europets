import test from 'node:test';
import assert from 'node:assert/strict';
import { secondNoticeAllowed, noticeCoversWait } from '../lib/clientAcknowledgement.js';
import { describeSituation } from '../lib/conciergeSituation.js';

const at = (uae) => `${uae}+04:00`;
const row = (sender, uae, body, extra = {}) => ({ sender, created_at: at(uae), body, ...extra });

// 3ad7e13e, 19 Oct: "On the way" got a notice; the client's real question
// at 12:55 (why is he drooling since the operation?) then got nothing.
const drooling = [
  row('client', '2026-10-19T11:03:00', 'On the way'),
  row('ai', '2026-10-19T11:03:10', "I've flagged it to the team now so they can confirm the slot.", { is_notice: true }),
  row('client', '2026-10-19T12:23:00', null, { media_type: 'audio' }),
  row('client', '2026-10-19T12:55:00', "Please ask the doctor why his mouth is watering since the operation."),
];

test('a new, different question in the same wait may get one more notice', () => {
  const now = Date.parse(at('2026-10-19T12:55:20'));
  assert.ok(noticeCoversWait(drooling, now));
  assert.ok(secondNoticeAllowed(drooling, now));
});

test('never a third notice, and none while staff are in the thread', () => {
  const now = Date.parse(at('2026-10-19T13:30:00'));
  const twice = [...drooling, row('ai', '2026-10-19T12:55:30', "I've passed that on too.", { is_notice: true }), row('client', '2026-10-19T13:29:00', 'And is that normal?')];
  assert.ok(!secondNoticeAllowed(twice, now));
  const staff = [row('staff', '2026-10-19T12:40:00', 'We will check.'), ...drooling.slice(3)];
  assert.ok(!secondNoticeAllowed([drooling[0], drooling[1], ...staff], now));
});

// 7a1c2e5e, 20 Oct 18:14: "May you also please share the location" right
// after a message the AI had handed to staff went unanswered until 08:21.
test('a handed-over conversation still lets the AI answer a simple question', () => {
  const text = describeSituation({ rows: [], now: Date.parse(at('2026-10-20T18:14:30')), handedOver: true });
  assert.match(text, /You may still answer a simple question yourself/);
  assert.match(text, /the address, opening hours/);
  assert.match(text, /don't book, move or cancel anything, and don't answer anything medical, about money/);
  assert.match(text, /new_question/);
});

// 4e492d6b, 21 Oct 14:49: "they'll come back to you shortly", staff replied at 16:47.
test('in the day the team comes back "as soon as they can", never "shortly"', () => {
  const day = describeSituation({ rows: [], now: Date.parse(at('2026-10-21T14:49:00')) });
  assert.match(day, /as soon as they can/);
  assert.match(day, /never "shortly" or "soon"/);
  assert.match(describeSituation({ rows: [], now: Date.parse(at('2026-10-21T23:00:00')) }), /CLOSED/);
});
