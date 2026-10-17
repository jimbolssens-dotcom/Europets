import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicClosedAt, clinicPeriodKey, closedNoticeText, noticeTextFor } from '../lib/clinicHours.js';
import { needsNoAnswer, noticeCoversWait, staffRepliedRecently } from '../lib/clientAcknowledgement.js';
import { decideSweepAction } from '../lib/whatsappSweepDecision.js';

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

test('the night notice says we are closed, the day one is unchanged', () => {
  const day = 'Thanks, a member of our team will be with you shortly.';
  assert.equal(noticeTextFor(day, uae(17, '10:00')), day);
  const late = noticeTextFor(day, uae(16, '20:09'));
  assert.match(late, /closed/);
  assert.match(late, /tomorrow at 8:00/);
  assert.doesNotMatch(late, /shortly|[—–]/);
  assert.match(closedNoticeText(uae(17, '02:55')), /at 8:00 this morning/);
  assert.match(closedNoticeText(uae(17, '02:55'), { media: true }), /^Thanks for sending that\./);
});

test('reactions and stickers need no answer, a photo does', () => {
  assert.equal(needsNoAnswer({ body: 'Reacted 👍' }), true);
  assert.equal(needsNoAnswer({ body: '', media_type: 'image', media_url: 'https://x/whatsapp/wamid.1.webp' }), true);
  assert.equal(needsNoAnswer({ body: '', media_type: 'image', media_url: 'https://x/whatsapp/wamid.2.jpeg' }), false);
});

// The kitten owner, 17/10/2026, an unregistered number: six "Still with our
// team on this, they'll be with you shortly" between 02:55 and 05:50.
const kittenNight = [
  row('client', 'Hello, please help me. My kitten urgently needs treatment', 17, '02:45'),
  row('ai', closedNoticeText(uae(17, '02:55')), 17, '02:55', { is_notice: true }),
  row('client', 'When please', 17, '02:56'),
  row('client', 'Thank you so much for your help. My kitten urgently needs treatment', 17, '02:57'),
  row('client', 'Thank you for looking into my request.', 17, '02:58'),
  row('client', 'Ok', 17, '03:09'),
  row('client', '', 17, '04:10', { media_type: 'image', media_url: 'https://x/a.jpeg' }),
  row('client', 'Please help us', 17, '04:10'),
  row('client', '', 17, '04:10', { media_type: 'video', media_url: 'https://x/b.mp4' }),
  row('client', 'Ok', 17, '04:20'),
  row('client', 'Reacted 👍', 17, '05:41'),
];
const until = (rows, hhmm, day = 17) => rows.filter((r) => Date.parse(r.created_at) <= uae(day, hhmm));

test('kitten night: one closed notice, then nothing for the rest of the night', () => {
  for (const at of ['03:05', '03:15', '04:20', '04:30', '05:50']) {
    assert.equal(decideSweepAction(until(kittenNight, at), true, uae(17, at)).action, 'nothing', at);
  }
});

test('kitten: still waiting once the clinic opens gets one daytime notice', () => {
  const rows = [...kittenNight, row('client', '??', 17, '14:53')];
  assert.equal(noticeCoversWait(rows, uae(17, '14:58')), false);
  assert.equal(decideSweepAction(rows, true, uae(17, '14:58')).action, 'with_staff_notice');
});

test('kitten: staff are on it, so no notice for the photo and "Please answer fast"', () => {
  const rows = [
    ...kittenNight,
    row('staff', 'Good afternoon, I am trying to call your number', 17, '17:11'),
    row('client', '', 17, '17:12', { media_type: 'image', media_url: 'https://x/c.jpeg' }),
    row('client', "It's my number", 17, '17:12'),
    row('client', 'Please answer fast', 17, '17:20'),
  ];
  assert.equal(staffRepliedRecently(rows, uae(17, '17:25')), true);
  const decision = decideSweepAction(rows, false, uae(17, '17:25'));
  assert.equal(decision.action, 'media_notice');
  assert.equal(decision.quiet, true); // still flagged for staff, the client just isn't told again
});

// Asking about Lucky, 16/10/2026: four "Still with our team", the last three
// each after the client only reacted 👍.
test('Lucky: follow-ups and reactions after the first notice get nothing', () => {
  const rows = [
    row('client', 'Good morning', 16, '10:29'),
    row('client', 'I would like to ask about lucky', 16, '10:29'),
    row('ai', 'Thanks, a member of our team will be with you shortly.', 16, '10:29', { is_notice: true }),
    row('client', "It seems he didn't make it", 16, '10:29'),
    row('client', 'Coz i cant find him in the list', 16, '10:29'),
  ];
  assert.equal(decideSweepAction(rows, true, uae(16, '10:35')).action, 'nothing');
  rows.push(row('client', 'Reacted 👍', 16, '11:49'));
  assert.equal(decideSweepAction(rows, true, uae(16, '11:55')).action, 'nothing');
});

test('a real reply ends the wait: the next question gets its notice', () => {
  const rows = [
    row('client', 'Can I book for Max?', 16, '10:00'),
    row('ai', 'Thanks, a member of our team will be with you shortly.', 16, '10:00', { is_notice: true }),
    row('staff', 'Yes, Thursday at 10:30?', 16, '10:20'),
    row('client', 'Also, is the vaccine due?', 16, '12:00'),
  ];
  assert.equal(noticeCoversWait(rows, uae(16, '12:05')), false);
  assert.equal(staffRepliedRecently(rows, uae(16, '12:05')), false);
});
