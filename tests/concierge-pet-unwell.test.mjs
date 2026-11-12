import test from 'node:test';
import assert from 'node:assert/strict';
import { urgentNoticeAllowed, secondNoticeAllowed } from '../lib/clientAcknowledgement.js';

const at = (uae) => `${uae}+04:00`;
const row = (sender, uae, body, extra = {}) => ({ sender, created_at: at(uae), body, ...extra });

// 45a75a7a, 31 Oct / 1 Nov: two notices already that day (a link, then a
// video at 21:29), then after midnight "she just vomited again" and "also
// she's got diarrhea" got nothing: never a third notice.
const vomiting = [
  row('staff', '2026-10-31T08:53:46', 'Our 10:00 AM appointment is open for today.'),
  row('client', '2026-10-31T12:57:26', 'https://www.facebook.com/share/r/x'),
  row('ai', '2026-10-31T12:57:37', "I can't open videos or links like this one myself, so I've passed it to the team.", { is_notice: true }),
  row('client', '2026-10-31T21:29:12', '', { media_type: 'video' }),
  row('ai', '2026-10-31T21:29:27', "Videos don't come through to me, but it's with the team. They'll look at it when we open at 8:00.", { is_notice: true }),
  row('client', '2026-11-01T00:08:17', 'she just vomited again'),
  row('client', '2026-11-01T00:08:39', 'also she has diarrhea'),
];

test('a pet getting worse after two notices still gets a reply', () => {
  const now = Date.parse(at('2026-11-01T00:08:50'));
  assert.equal(secondNoticeAllowed(vomiting, now), false); // the rule that left it silent
  assert.equal(urgentNoticeAllowed(vomiting, now), true);
});

// 97158128, 31 Oct 21:50: a notice about a video, then two minutes later
// "Doctor said this is okay. But this is not okay." got nothing (the
// 20-minute gap for a second notice).
test('a worried follow-up two minutes after a notice still gets a reply', () => {
  const rows = [
    row('client', '2026-10-31T21:50:22', '', { media_type: 'video' }),
    row('ai', '2026-10-31T21:50:41', "I'm not able to view videos here, so I've passed it to our team.", { is_notice: true }),
    row('client', '2026-10-31T21:52:24', 'We already brought her this morning. Doctor said this is okay.'),
    row('client', '2026-10-31T21:52:33', 'But this is not okay.'),
  ];
  const now = Date.parse(at('2026-10-31T21:52:45'));
  assert.equal(secondNoticeAllowed(rows, now), false);
  assert.equal(urgentNoticeAllowed(rows, now), true);
});

test('the urgent line is said once per wait, and never while staff are in the thread', () => {
  const told = [
    ...vomiting,
    row('ai', '2026-11-01T00:09:00', "If you feel she can't wait until morning, a 24-hour vet clinic can see her.", { is_notice: true }),
    row('client', '2026-11-01T00:30:00', 'still vomiting'),
  ];
  assert.equal(urgentNoticeAllowed(told, Date.parse(at('2026-11-01T00:30:10'))), false);
  const staffHere = [
    row('staff', '2026-11-01T10:00:00', 'How is she now?'),
    row('client', '2026-11-01T10:05:00', 'worse, vomiting again'),
  ];
  assert.equal(urgentNoticeAllowed(staffHere, Date.parse(at('2026-11-01T10:05:10'))), false);
});

// 282f4eee, 10 Nov 09:51: a pet not eating got a notice; the client's next
// detail about the same illness 30 seconds later got a second.
test('no second notice seconds after one that already answered the pet being unwell', () => {
  const rows = [
    row('client', '2026-11-10T09:51:10', 'There is one of my babies refuse to eat'),
    row('client', '2026-11-10T09:51:20', 'Can I send him'),
    row('ai', '2026-11-10T09:52:00', "I'm sorry one of your babies isn't eating. I've passed this to the team so they can arrange for him to be seen.", { is_notice: true }),
    row('client', '2026-11-10T09:52:20', 'I think he has flu'),
  ];
  assert.equal(urgentNoticeAllowed(rows, Date.parse(at('2026-11-10T09:52:30'))), false);
  // Later on, getting worse is answered again.
  const later = [...rows, row('client', '2026-11-10T10:30:00', 'Now he is vomiting')];
  assert.equal(urgentNoticeAllowed(later, Date.parse(at('2026-11-10T10:30:10'))), true);
});

// 321a91f3, 10 Nov 14:38: a notice about an infection, then the client's
// follow-up a minute later got a second.
test('no second notice a minute after one about the same infection', () => {
  const rows = [
    row('client', '2026-11-10T14:37:30', 'Can I buy that medicine from you, for the mouth infection'),
    row('ai', '2026-11-10T14:38:00', "Hi, I've passed your request for the mouth infection medicine to the team so they can check which medicine.", { is_notice: true }),
    row('client', '2026-11-10T14:38:20', 'Because I got different cats here with such problems'),
  ];
  assert.equal(urgentNoticeAllowed(rows, Date.parse(at('2026-11-10T14:38:30'))), false);
});
