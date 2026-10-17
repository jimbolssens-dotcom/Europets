import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationAlreadyClosed } from '../lib/clientAcknowledgement.js';
import { decideSweepAction } from '../lib/whatsappSweepDecision.js';

const m = (sender, body, min, extra = {}) => ({ sender, body, created_at: new Date(Date.UTC(2026, 9, 16, 13, 30) + min * 60000).toISOString(), ...extra });

// Concierge review 17/10/2026: a reminder, a question, then "🩷" got a
// second closer after the first one.
const reminderThread = [
  m('system', 'This is a reminder that Bear has an appointment on Saturday 17/10 at 10:00 am.', 0),
  m('client', 'Hi there, thank you so much, may I ask which doctor it is please?', 2),
  m('ai', "Bear's appointment is tomorrow at 10:00 am, with Dr. Dalma Balog.", 3),
  m('client', 'Ok...thank you so much 🩷', 4),
  m('ai', "You're very welcome! 🩷 If anything changes, just message us here.", 4.2),
  m('client', '🩷', 4.5),
];

test('a thank-you for an answer gets one warm reply', () => {
  assert.equal(conversationAlreadyClosed(reminderThread.slice(0, 4)), false);
});

test('"🩷" after the closer: nothing more, from the concierge or the sweep', () => {
  assert.equal(conversationAlreadyClosed(reminderThread), true);
  assert.equal(decideSweepAction(reminderThread, false, Date.parse(reminderThread.at(-1).created_at) + 5 * 60000).action, 'nothing');
});

test('a bare 👍 or reaction to the AI needs no reply', () => {
  const rows = [m('client', 'Can I come at 5?', 0), m('ai', 'Yes, booked for 5:00 PM.', 1), m('client', '👍', 2)];
  assert.equal(conversationAlreadyClosed(rows), true);
  assert.equal(conversationAlreadyClosed([...rows.slice(0, 2), m('client', 'Reacted 🙏', 2)]), true);
});

test('"Thanks" after a booking still gets its reply; a new question always does', () => {
  const rows = [m('client', 'Thanks 10:30', 0), m('ai', 'Done, booked for Tuesday at 10:30.', 1), m('client', 'Thanks', 2)];
  assert.equal(conversationAlreadyClosed(rows), false);
  const after = [...rows, m('ai', "You're very welcome!", 2.1), m('client', 'Thanks, and can I bring both cats?', 3)];
  assert.equal(conversationAlreadyClosed(after), false);
});

test('staff replied last: not the AI closing, leave it to the staff rules', () => {
  const rows = [m('client', 'Do you have Royal Canin 7 kg?', 0), m('staff', 'Yes, reserved for you.', 10), m('client', '👍', 11)];
  assert.equal(conversationAlreadyClosed(rows), false);
});

import { isAcknowledgementOnly } from '../lib/clientAcknowledgement.js';

test('a thank-you with a time, date or amount in it is an answer', () => {
  for (const t of ['Thanks 10:30', 'Ok 5pm', 'ok thanks, the 23rd']) assert.equal(isAcknowledgementOnly(t), false, t);
});
