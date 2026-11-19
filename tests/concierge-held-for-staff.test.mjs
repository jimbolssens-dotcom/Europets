import test from 'node:test';
import assert from 'node:assert/strict';
import { heldForStaff, staffRepliedRecently } from '../lib/clientAcknowledgement.js';

const at = (uae) => `${uae}+04:00`;
const row = (sender, uae, body, extra = {}) => ({ sender, created_at: at(uae), body, ...extra });

// 672e793d, 17 Nov: staff offered a slot at 16:42; "How much for the
// appointment." at 16:54 was left for staff (they were active) and nobody
// answered for days.
const thread = [
  row('client', '2026-11-16T12:32:00', 'I need an appt. for my Labrador'),
  row('ai', '2026-11-16T12:32:10', "I've passed your message to the team.", { is_notice: true }),
  row('staff', '2026-11-17T16:42:00', 'We have slot on Saturday at 10:30am. Would you like to take this?'),
  row('client', '2026-11-17T16:54:00', 'How much for the appointment.'),
  row('client', '2026-11-17T16:55:00', 'He is a service dog. Older.'),
];

test('a message held back for staff is not marked handled', () => {
  const trace = Object.assign([], { staffActive: true });
  assert.equal(heldForStaff({ action: 'handover', message: null, trace }), true);
  assert.equal(heldForStaff({ action: 'silent', trace }), true);
  assert.equal(heldForStaff({ action: 'reply', trace }), false); // answered
  assert.equal(heldForStaff({ action: 'handover', trace: [] }), false); // staff weren't active
});

test('the sweep waits while staff are active, then lets the AI answer', () => {
  assert.equal(staffRepliedRecently(thread, Date.parse(at('2026-11-17T17:00:00'))), true); // still waiting
  assert.equal(staffRepliedRecently(thread, Date.parse(at('2026-11-17T17:30:00'))), false); // 30 min, no staff: AI's turn
});
