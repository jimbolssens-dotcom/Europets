import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { staffRepliedRecently, isStaffConversation, noticeNotNeeded } from '../lib/clientAcknowledgement.js';

// staffRecentlyEngaged (the concierge's "staff in the thread" mode) lives in
// lib/whatsappConcierge.js, whose imports reach the database: pull the one
// function out and run it with the shared rule.
const source = await readFile(new URL('../lib/whatsappConcierge.js', import.meta.url), 'utf8');
const fnSource = source.match(/export function staffRecentlyEngaged[\s\S]*?\n}\n/)[0].replace('export ', '');
const staffRecentlyEngaged = new Function('staffRepliedRecently', 'isStaffConversation', `${fnSource}\nreturn staffRecentlyEngaged;`)(
  staffRepliedRecently,
  isStaffConversation
);

const at = (uae) => Date.parse(`${uae}+04:00`);
const row = (sender, uae, body, extra = {}) => ({ sender, created_at: new Date(at(uae)).toISOString(), body, ...extra });

// Review of 5 Nov, anonymised.

// edbafa7a, 3 Nov: staff asked about the app, the client answered, and a
// billing question 55 minutes later got nothing for 20 hours.
const billing = [
  row('client', '2026-11-03T12:16:10', 'Could you let me know when the second bottle runs out, and the cost so far?'),
  row('ai', '2026-11-03T12:16:23', "I've passed both questions to the team.", { is_notice: true }),
  row('client', '2026-11-03T12:17:07', 'Perfect, thank you'),
  row('staff', '2026-11-03T13:39:29', 'Do you have our app installed? If not, I can send you the app link.'),
  row('client', '2026-11-03T13:42:59', 'Yes I have it'),
  row('client', '2026-11-03T14:37:28', 'Does this invoice cover the costs up to today only, or until the second bottle is finished?'),
];

test('an exchange the client already answered is over: the billing question gets a notice and the AI', () => {
  const now = at('2026-11-03T14:37:35');
  assert.equal(staffRepliedRecently(billing, now), false);
  assert.equal(noticeNotNeeded(billing, now), false);
  assert.equal(staffRecentlyEngaged(billing, now), false);
});

// 19527fcd, 3 Nov: staff wrote three lines at 14:53; "Hello. I'm still
// waiting on Rex" at 16:10 (77 minutes on) never got an answer, because
// the AI kept out of the thread for two hours.
const waiting = [
  row('client', '2026-11-03T14:29:14', 'Any update for Rex? Ear surgery?'),
  row('ai', '2026-11-03T14:29:30', "I've passed your question to the team.", { is_notice: true }),
  row('staff', '2026-11-03T14:53:19', 'Done'),
  row('staff', '2026-11-03T14:53:37', '...sorry for late reply I was in surgery till now'),
  row('staff', '2026-11-03T14:53:56', 'Report is uploaded but all went well...'),
  row('client', '2026-11-03T16:10:45', "Hello. I'm still waiting on Rex"),
];

test('more than an hour after staff last wrote, the AI is no longer kept out', () => {
  const now = at('2026-11-03T16:10:50');
  assert.equal(staffRecentlyEngaged(waiting, now), false);
  assert.equal(staffRepliedRecently(waiting, now), false);
});

// c40e311b, 2 Nov: the only staff row was the invoice link from the invoice
// page; a medication question 80 minutes later waited until 8:30 next day.
const invoiceLink = [
  row('client', '2026-11-02T12:37:39', 'Should I bring my cat today?'),
  row('staff', '2026-11-02T17:19:36', 'Here is your invoice from Europets Clinic: https://portal.epc.vet/api/invoices/x/tax-invoice-pdf'),
  row('client', '2026-11-02T17:30:00', 'This is the medication I mentioned. Should I continue giving it?'),
];

test('the invoice link from the invoice page is not staff in the thread', () => {
  const now = at('2026-11-02T17:30:10');
  assert.equal(isStaffConversation(invoiceLink[1]), false);
  assert.equal(staffRepliedRecently(invoiceLink, now), false);
  assert.equal(staffRecentlyEngaged(invoiceLink, now), false);
});

// Still true: staff really talking with the client keep both out.
test('staff writing within the hour, client answering minutes later: still staff in the thread', () => {
  const live = [
    row('staff', '2026-11-03T13:42:16', "Have you done the registration? I can't see an account under your number."),
    row('client', '2026-11-03T13:42:31', 'Yes I did'),
    row('client', '2026-11-03T13:50:00', 'Is it with Dr Jim?'),
  ];
  const now = at('2026-11-03T13:50:05');
  assert.equal(staffRepliedRecently(live, now), true);
  assert.equal(noticeNotNeeded(live, now), true);
  assert.equal(staffRecentlyEngaged(live, now), true);
});

test('an automated reminder or an AI reply after staff still ends their turn, as before', () => {
  const now = at('2026-11-03T13:50:05');
  const afterSystem = [row('staff', '2026-11-03T13:40:00', 'See you at 4'), row('system', '2026-11-03T13:45:00', 'Reminder: your appointment'), row('client', '2026-11-03T13:50:00', 'Ok which vet?')];
  assert.equal(staffRecentlyEngaged(afterSystem, now), false);
  const afterAi = [row('staff', '2026-11-03T13:40:00', 'See you at 4'), row('ai', '2026-11-03T13:45:00', 'Your appointment is at 4pm.'), row('client', '2026-11-03T13:50:00', 'Thanks')];
  assert.equal(staffRecentlyEngaged(afterAi, now), false);
});
