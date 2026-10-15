import test from 'node:test';
import assert from 'node:assert/strict';
import { isAcknowledgementOnly, burstIsAcknowledgementOnly, noticeRecentlySent } from '../lib/clientAcknowledgement.js';

test('acknowledgements', () => {
  for (const t of ['Thank you', 'Thanks', 'Ok', 'Great!', 'Thanks a ton !!', '👍', '🙏🙏', 'ok thank you so much', 'Perfect, see you Saturday', 'Noted thanks dr']) {
    assert.equal(isAcknowledgementOnly(t), true, t);
  }
  for (const t of ['Its dry food/kibble', 'Do you have Royal Canin sensitivity control 7 kg for dogs ?', 'ok can I come at 5', 'Thanks, he is vomiting again', 'yes', 'Hello', 'ok?', '']) {
    assert.equal(isAcknowledgementOnly(t), false, t);
  }
});

// Andrea Moraes, 15/10/2026: replay each message against the rows it saw.
const m = (sender, body, min, extra = {}) => ({ sender, body, created_at: new Date(Date.UTC(2026, 9, 15, 13, 0) + min * 60000).toISOString(), ...extra });
const thread = [
  m('client', 'Hello and Good afternoon', 4.6),
  m('ai', 'Good afternoon, Andrea!', 4.7),
  m('client', 'Do you have Royal Canin sensitivity control 7 kg for dogs ?', 5.2),
  m('ai', 'Thanks, a member of our team will be with you shortly.', 5.4, { is_notice: true }),
  m('client', 'Thank you', 5.6),
  m('client', 'Its dry food/kibble', 8.5),
  m('staff', 'We reserved the 7kg Royal Canin for you. See you on Saturday.', 24.1),
  m('client', 'Great!', 35.1),
  m('client', 'Thanks a ton !!', 35.2),
];
const upTo = (body) => thread.slice(0, thread.findIndex((r) => r.body === body) + 1);
const at = (body) => new Date(upTo(body).at(-1).created_at).getTime() + 3000;

test('no notice on a bare thank-you while waiting (already told)', () => {
  const rows = upTo('Thank you');
  assert.equal(burstIsAcknowledgementOnly(rows), false); // the question is still unanswered
  assert.equal(noticeRecentlySent(rows, at('Thank you')), true);
});

test('a follow-up detail 3 minutes after the notice gets no second notice', () => {
  assert.equal(noticeRecentlySent(upTo('Its dry food/kibble'), at('Its dry food/kibble')), true);
});

test('thanks after staff answered: nothing at all', () => {
  assert.equal(burstIsAcknowledgementOnly(upTo('Great!')), true);
  assert.equal(burstIsAcknowledgementOnly(upTo('Thanks a ton !!')), true);
});

test('notice cooldown ends after 15 minutes, and a real reply resets it', () => {
  const rows = upTo('Its dry food/kibble');
  assert.equal(noticeRecentlySent(rows, at('Thank you') + 16 * 60000), false);
  assert.equal(noticeRecentlySent(upTo('Great!'), at('Great!')), false);
});

test('Debra Al Hajeri: "Ok" to the automated reminder after a staff message', () => {
  const rows = [
    m('staff', 'Just to reconfirm that we have already booked', 0),
    m('system', 'Here is your secure link to settle your balance', 72),
    m('system', 'This is a reminder that Jaime has an appointment', 81),
    m('client', 'Ok', 81.5),
  ];
  assert.equal(burstIsAcknowledgementOnly(rows), true);
});
