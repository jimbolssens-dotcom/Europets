import test from 'node:test';
import assert from 'node:assert/strict';
import { chaseNoticeAllowed, secondNoticeAllowed } from '../lib/clientAcknowledgement.js';

const at = (uae) => `${uae}+04:00`;
const row = (sender, uae, body, extra = {}) => ({ sender, created_at: at(uae), body, ...extra });

// d2a52ce2, 14 Nov: a photo after a cat's sedation got a notice at 18:12;
// "Still waiting for an answer what the cat get and how much" at 18:52 got
// nothing (a chase isn't a new question).
const sedation = [
  row('system', '2026-11-14T10:13:45', 'Consent form sent: Day Procedure Consent'),
  row('client', '2026-11-14T18:12:21', '', { media_type: 'image' }),
  row('ai', '2026-11-14T18:12:35', "I'm so sorry, that sounds really worrying. I've passed your message and photo straight to her vet.", { is_notice: true }),
  row('client', '2026-11-14T18:13:51', 'She is calming down now a little bit, but it is not normal'),
  row('client', '2026-11-14T18:52:27', 'Still waiting for an answer what the cat got and how much'),
];

test('a chase 40 minutes after a notice gets one short reply', () => {
  const now = Date.parse(at('2026-11-14T18:52:40'));
  assert.equal(secondNoticeAllowed(sedation, now), true); // only for a new question, which this isn't
  assert.equal(chaseNoticeAllowed(sedation, now), true);
});

// 7bde4346, 14 Nov: two notices (17:03, 17:28), then "No one has answered
// my questions on both of your channels" at 18:03: never a third notice.
const twoNotices = [
  row('client', '2026-11-14T17:02:50', 'Can you look over these please'),
  row('ai', '2026-11-14T17:03:12', "I've passed your questions straight to the vets.", { is_notice: true }),
  row('client', '2026-11-14T17:28:42', 'Is this affecting him negatively?'),
  row('ai', '2026-11-14T17:28:57', "I've also passed your question to the vets.", { is_notice: true }),
  row('client', '2026-11-14T18:03:39', 'No one has answered my questions on both of your channels'),
];

test('a chase after two notices still gets one reply', () => {
  const now = Date.parse(at('2026-11-14T18:03:50'));
  assert.equal(secondNoticeAllowed(twoNotices, now), false); // the rule that left it silent
  assert.equal(chaseNoticeAllowed(twoNotices, now), true);
});

test('not too soon, not a fourth, not while staff are in the thread', () => {
  assert.equal(chaseNoticeAllowed(sedation, Date.parse(at('2026-11-14T18:30:00'))), false);
  const third = [...twoNotices, row('ai', '2026-11-14T18:04:00', 'Sorry for the wait.', { is_notice: true }), row('client', '2026-11-14T19:10:00', 'Hello??')];
  assert.equal(chaseNoticeAllowed(third, Date.parse(at('2026-11-14T19:10:10'))), false);
  const staff = [...sedation.slice(0, 3), row('staff', '2026-11-14T18:40:00', 'Checking with the vet now'), sedation[4]];
  assert.equal(chaseNoticeAllowed(staff, Date.parse(at('2026-11-14T18:52:40'))), false);
});

test('never without a first notice', () => {
  const none = [row('client', '2026-11-14T18:00:00', 'Still waiting?')];
  assert.equal(chaseNoticeAllowed(none, Date.parse(at('2026-11-14T18:40:00'))), false);
});
