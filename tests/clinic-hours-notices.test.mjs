import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicClosedAt, clinicPeriodKey, fallbackHoldingText } from '../lib/clinicHours.js';
import { needsNoAnswer, noticeCoversWait, noticeNotNeeded, staffRepliedRecently } from '../lib/clientAcknowledgement.js';
import { describeSituation } from '../lib/conciergeSituation.js';

// UAE local time on a given October 2026 day, as a timestamp.
const uae = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(2026, 9, day, h - 4, m);
};
const row = (sender, body, day, hhmm, extra = {}) => ({ sender, body, created_at: new Date(uae(day, hhmm)).toISOString(), ...extra });

test('closed from 19:00 until reception opens at 8:00', () => {
  assert.equal(clinicClosedAt(uae(16, '18:59')), false);
  assert.equal(clinicClosedAt(uae(16, '19:00')), true);
  assert.equal(clinicClosedAt(uae(17, '02:55')), true);
  assert.equal(clinicClosedAt(uae(17, '07:59')), true);
  assert.equal(clinicClosedAt(uae(17, '08:00')), false);
  // One night is one period, either side of midnight.
  assert.equal(clinicPeriodKey(uae(16, '23:00')), clinicPeriodKey(uae(17, '03:00')));
  assert.notEqual(clinicPeriodKey(uae(17, '03:00')), clinicPeriodKey(uae(17, '09:00')));
});

test('the fallback line (only when the AI fails) is short and honest about timing', () => {
  assert.doesNotMatch(fallbackHoldingText(uae(17, '10:00')), /shortly|8:00|[—–]/);
  assert.match(fallbackHoldingText(uae(16, '20:09')), /when we open at 8:00 tomorrow\.$/);
  assert.match(fallbackHoldingText(uae(17, '02:55')), /when we open at 8:00\.$/);
});

test('the concierge is told when we are closed and when we open', () => {
  const night = describeSituation({ rows: [], now: uae(16, '20:09') });
  assert.match(night, /CLOSED: reception opens at 8:00 tomorrow/);
  assert.match(night, /never say anyone will reply soon or shortly/);
  assert.match(describeSituation({ rows: [], now: uae(17, '02:55') }), /opens at 8:00 this morning/);
  assert.match(describeSituation({ rows: [], now: uae(17, '10:00') }), /clinic is open/);
});

test('reactions and stickers need no answer, a photo does', () => {
  assert.equal(needsNoAnswer({ body: 'Reacted 👍' }), true);
  assert.equal(needsNoAnswer({ body: '', media_type: 'image', media_url: 'https://x/whatsapp/wamid.1.webp' }), true);
  assert.equal(needsNoAnswer({ body: '', media_type: 'image', media_url: 'https://x/whatsapp/wamid.2.jpeg' }), false);
});

// The kitten owner, 17/10/2026, an unregistered number: six "Still with our
// team on this, they'll be with you shortly" between 02:55 and 05:50.
const holding = 'We have your message about your kitten; the team will get back to you when we open at 8:00.';
const kittenNight = [
  row('client', 'Hello, please help me. My kitten urgently needs treatment', 17, '02:45'),
  row('ai', holding, 17, '02:55', { is_notice: true }),
  row('client', 'When please', 17, '02:56'),
  row('client', 'Ok', 17, '03:09'),
  row('client', 'Please help us', 17, '04:10'),
  row('client', 'Reacted 👍', 17, '05:41'),
];

test('kitten night: one holding message, and the concierge is told it was sent', () => {
  for (const at of ['03:05', '04:20', '05:50']) assert.equal(noticeNotNeeded(kittenNight, uae(17, at)), true, at);
  const situation = describeSituation({ rows: kittenNight, now: uae(17, '05:50'), unregistered: true });
  assert.match(situation, /already been told \(at 02:55\)/);
  assert.match(situation, /isn't linked to any client/);
});

test('kitten: still waiting once the clinic opens, one more holding message is allowed', () => {
  const rows = [...kittenNight, row('client', '??', 17, '14:53')];
  assert.equal(noticeCoversWait(rows, uae(17, '14:58')), false);
});

test('staff active in the last hour: no holding message, and the concierge is told', () => {
  const rows = [
    ...kittenNight,
    row('staff', 'Good afternoon, I am trying to call your number', 17, '17:11'),
    row('client', 'Please answer fast', 17, '17:20'),
  ];
  assert.equal(staffRepliedRecently(rows, uae(17, '17:25')), true);
  assert.equal(noticeNotNeeded(rows, uae(17, '17:25')), true);
  assert.match(describeSituation({ rows, now: uae(17, '17:25'), staffEngaged: true }), /last wrote 14 minutes ago/);
});

test('a real reply ends the wait', () => {
  const rows = [
    row('client', 'Can I book for Max?', 16, '10:00'),
    row('ai', 'Thanks, the team has your message.', 16, '10:00', { is_notice: true }),
    row('staff', 'Yes, Thursday at 10:30?', 16, '10:20'),
    row('client', 'Also, is the vaccine due?', 16, '12:00'),
  ];
  assert.equal(noticeNotNeeded(rows, uae(16, '12:05')), false);
  assert.doesNotMatch(describeSituation({ rows, now: uae(16, '12:05') }), /already been told/);
});
