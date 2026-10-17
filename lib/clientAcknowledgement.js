// lib/clientAcknowledgement.js
// When the automatic "a member of our team will be with you shortly" /
// "still with our team" notices should stay quiet. Pure, so it can be
// tested directly (tests/client-acknowledgement.test.mjs).

import { clinicPeriodKey } from './clinicHours.js';
//
// A real incident: a client asked about a dog food, the AI handed it to
// staff, and every "Thank you", "Thanks", "Ok" after that got its own
// "Still with our team" line. Then staff answered, the client said
// "Great!" and "Thanks a ton !!", and got "a member of our team will be
// with you shortly" all over again for a conversation that was finished.

const ACK_CORE = new Set([
  'thanks', 'thank', 'thankyou', 'thanku', 'thx', 'thnx', 'tnx', 'ty', 'tq', 'tysm',
  'ok', 'okay', 'okey', 'okie', 'oki', 'k', 'kk', 'okk', 'okayy',
  'great', 'perfect', 'cool', 'noted', 'sure', 'alright', 'awesome', 'amazing',
  'wonderful', 'lovely', 'nice', 'good', 'fine', 'super', 'excellent', 'brilliant',
  'appreciate', 'appreciated', 'cheers', 'received', 'understood', 'gotcha',
  'shukran', 'merci', 'gracias', 'danke', 'bye',
]);

const ACK_FILLER = new Set([
  ...ACK_CORE,
  'you', 'u', 'yu', 'it', 'is', 'that', 'this', 'so', 'very', 'much', 'many', 'a', 'ton', 'tons', 'lot', 'lots',
  'again', 'dear', 'doc', 'dr', 'doctor', 'team', 'guys', 'all', 'everyone', 'sir', 'madam', 'maam',
  'see', 'soon', 'then', 'there', 'later', 'got', 'yes', 'yep', 'yeah', 'yup', 'sounds', 'will', 'do',
  'have', 'day', 'evening', 'night', 'morning', 'afternoon', 'weekend', 'and', 'for', 'the', 'help',
  'your', 'really', 'too', 'just', 'oh', 'ah', 'wow', 'haha', 'hehe', 'well', 'news', 'job',
  'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

// True when a message is nothing but a thank-you / "ok" / emoji: nothing
// for anyone to answer, so no notice and no fresh handover for it.
export function isAcknowledgementOnly(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.length > 80) return false;
  if (raw.includes('?')) return false;
  // A time, a date or an amount is an answer ("Thanks 10:30", "Ok 5pm"),
  // not a thank-you.
  if (/\d/.test(raw)) return false;
  const words = raw
    .toLowerCase()
    .replace(/[^a-z\s']/g, ' ')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter(Boolean);
  // Emoji (or punctuation) only, e.g. "👍" or "🙏🙏".
  if (words.length === 0) return /\p{Extended_Pictographic}/u.test(raw);
  return words.every((w) => ACK_FILLER.has(w)) && words.some((w) => ACK_CORE.has(w));
}

// Staff, the AI, or an automated message (reminder, payment link): each one
// starts a fresh stretch of things the client might be answering.
function isClinicReply(row) {
  return (row.sender === 'staff' || row.sender === 'ai' || row.sender === 'system') && !row.is_notice;
}

// The client's messages since the clinic's last real reply or automated message (oldest first).
export function unansweredClientRows(rows) {
  let lastClinicIdx = -1;
  rows.forEach((r, i) => {
    if (isClinicReply(r)) lastClinicIdx = i;
  });
  return rows.slice(lastClinicIdx + 1).filter((r) => r.sender === 'client');
}

// A tap-and-hold emoji reaction ("Reacted 👍"), or taking one off.
export function isBareReaction(body) {
  return body === 'Removed a reaction' || /^Reacted /.test(body || '');
}

// A WhatsApp sticker is stored as an image (see the webhook), but always
// as .webp, which a photo from the camera never is.
export function isSticker(row) {
  return row.media_type === 'image' && !row.body && /\.webp(\?|$)/i.test(row.media_url || '');
}

// A client message nobody needs to answer: a thank-you or "ok", a
// reaction, a sticker. A real thread got "Still with our team" four times,
// each after the client only reacted 👍 to a message.
export function needsNoAnswer(row) {
  if (isSticker(row)) return true;
  return !row.media_type && (isAcknowledgementOnly(row.body) || isBareReaction(row.body));
}

// Everything the client has sent since the clinic last replied needs no
// answer (a photo or voice note always counts as needing one).
export function burstIsAcknowledgementOnly(rows) {
  const unanswered = unansweredClientRows(rows);
  return unanswered.length > 0 && unanswered.every(needsNoAnswer);
}

// One automatic notice per wait: once the client has been told someone
// will get back to them, they aren't told again, however many more
// messages they send, until staff or the AI actually reply. It used to
// expire after 15 minutes, and the 5-minute sweep ignored even that, so a
// client writing through the night got the same line every time. The one
// exception is the clinic opening or closing in between: a client told at
// 23:00 that we're closed hears once more, in the morning, that the team
// is on it.
export function noticeCoversWait(rows, now = Date.now()) {
  const period = clinicPeriodKey(now);
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (isClinicReply(row)) return false;
    if (row.is_notice && clinicPeriodKey(new Date(row.created_at).getTime()) === period) return true;
  }
  return false;
}

// A member of staff wrote in the thread this recently: a person is plainly
// there, so "a member of our team will be with you" only reads as if
// nobody is. A real thread had staff answering within minutes while the
// client's in-between messages still got the notice. The thread is still
// flagged for them as before; only the notice is left out.
export const STAFF_ACTIVE_MS = 60 * 60 * 1000;

export function staffRepliedRecently(rows, now = Date.now()) {
  return rows.some((r) => {
    if (r.sender !== 'staff') return false;
    const at = new Date(r.created_at).getTime();
    return Number.isFinite(at) && now - at < STAFF_ACTIVE_MS;
  });
}

// No automatic notice for this message, for either reason above.
export function noticeNotNeeded(rows, now = Date.now()) {
  return noticeCoversWait(rows, now) || staffRepliedRecently(rows, now);
}

// The client is answering one of the clinic's automated messages (an
// appointment reminder, a payment link or receipt): the newest message from
// the clinic side, notices aside, is a 'system' row. That's a new topic,
// so an older handover or staff exchange doesn't cover it. Real cases: a
// thread handed over at 12:22 answered a 17:30 reminder's "Yes 👍🏼, could
// you confirm that please?" with "Still with our team"; "Okay" to a
// reminder got "a member of our team will be with you shortly".
export function replyingToAutomatedMessage(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.sender === 'client' || row.is_notice) continue;
    return row.sender === 'system';
  }
  return false;
}
