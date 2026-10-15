// lib/clientAcknowledgement.js
// When the automatic "a member of our team will be with you shortly" /
// "still with our team" notices should stay quiet. Pure, so it can be
// tested directly (tests/client-acknowledgement.test.mjs).
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

function isClinicReply(row) {
  return (row.sender === 'staff' || row.sender === 'ai') && !row.is_notice;
}

// The client's messages since the clinic's last real reply (oldest first).
export function unansweredClientRows(rows) {
  let lastClinicIdx = -1;
  rows.forEach((r, i) => {
    if (isClinicReply(r)) lastClinicIdx = i;
  });
  return rows.slice(lastClinicIdx + 1).filter((r) => r.sender === 'client');
}

// Everything the client has sent since the clinic last replied is just
// acknowledgement (text only: a photo or voice note always counts).
export function burstIsAcknowledgementOnly(rows) {
  const unanswered = unansweredClientRows(rows);
  return unanswered.length > 0 && unanswered.every((r) => !r.media_type && isAcknowledgementOnly(r.body));
}

// How long one automatic notice covers the client's follow-ups: they were
// just told someone will be with them, so saying it again a minute later
// (and again, and again) only adds noise.
export const NOTICE_COOLDOWN_MS = 15 * 60 * 1000;

// An automatic notice already went out since the clinic's last real reply,
// recently enough to still cover a new message.
export function noticeRecentlySent(rows, now = Date.now()) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (isClinicReply(row)) return false;
    if (row.is_notice) {
      const sentAt = new Date(row.created_at).getTime();
      return Number.isFinite(sentAt) && now - sentAt < NOTICE_COOLDOWN_MS;
    }
  }
  return false;
}
