// lib/clinicHours.js
// When the clinic is closed, for the automatic WhatsApp notices: reception
// opens at 08:00 and the clinic closes at 19:00, every day, UAE time
// (UTC+4, no DST). Pure, so it can be tested directly.
//
// A real night: a kitten owner writing between 02:55 and 05:50 got "a member
// of our team will be with you shortly" six times. Nobody was there, and
// "shortly" read as minutes. Out of hours the client is now told plainly
// that we're closed and the reply may not come until the morning.

export const RECEPTION_OPENS_HOUR = 8;
export const CLINIC_CLOSES_HOUR = 19;

const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;

function uaeParts(now) {
  const d = new Date(new Date(now).getTime() + UAE_OFFSET_MS);
  return { hour: d.getUTCHours(), date: d.toISOString().slice(0, 10) };
}

export function clinicClosedAt(now = Date.now()) {
  const { hour } = uaeParts(now);
  return hour < RECEPTION_OPENS_HOUR || hour >= CLINIC_CLOSES_HOUR;
}

// One key per opening day and one per night (19:00 to 08:00 the next
// morning counts as the evening's date), so "one notice per wait" can tell
// a notice sent last night from one that's due now the clinic is open.
export function clinicPeriodKey(now = Date.now()) {
  const { hour, date } = uaeParts(now);
  if (hour >= CLINIC_CLOSES_HOUR) return `closed:${date}`;
  if (hour < RECEPTION_OPENS_HOUR) {
    return `closed:${uaeParts(new Date(now).getTime() - 24 * 60 * 60 * 1000).date}`;
  }
  return `open:${date}`;
}

// The notice sent instead of "with you shortly" while the clinic is closed.
// It also says plainly that a real emergency shouldn't wait for us, without
// sending anyone away: we name no other clinic, and it ends on us being
// there for them in the morning.
export function closedNoticeText(now = Date.now(), { media = false } = {}) {
  const thanks = media ? 'Thanks for sending that' : 'Thanks for your message';
  const { hour } = uaeParts(now);
  const evening = hour >= CLINIC_CLOSES_HOUR;
  const opens = evening ? 'tomorrow at 8:00' : 'at 8:00 this morning';
  return (
    `${thanks}, and we're sorry we can't be with you right now. ` +
    `The clinic is closed and reception opens again ${opens}. We'll reply as soon as we can, but it may not be until the morning. ` +
    `If you feel this is an emergency, please don't hold on for us: a 24-hour vet clinic will be able to see your pet ${evening ? 'tonight' : 'straight away'}. ` +
    `Otherwise, we'll be here for you as soon as we open.`
  );
}

// The daytime notice as given, or the closed one at night.
export function noticeTextFor(daytimeText, now = Date.now(), opts = {}) {
  return clinicClosedAt(now) ? closedNoticeText(now, opts) : daytimeText;
}
