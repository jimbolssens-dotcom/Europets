// lib/whatsappSweepDecision.js
// What the unanswered-message sweep (lib/whatsappUnanswered.js) should do
// with one thread, worked out from its recent rows alone (oldest first) and
// whether it's currently handed to staff (threadHandedOver). Pure, so the
// rules can be tested directly:
//   - one automatic message per client message: anything the AI sent after
//     the client's latest message (a notice included) means nothing more;
//   - judge everything unanswered since the clinic's last real reply, not
//     just the last line;
//   - once handed to staff: no answer, no closer, just "still with our team".

import { isAcknowledgementOnly } from './clientAcknowledgement.js';

export function isBareReaction(body) {
  return body === 'Removed a reaction' || /^Reacted /.test(body || '');
}

export function unansweredText(row) {
  if (row.media_type === 'audio') return row.transcript ? `[voice note] ${row.transcript}` : '[voice note]';
  if (row.media_type === 'image') return row.body ? `[photo] ${row.body}` : '[photo]';
  if (row.media_type) return row.body ? `[file] ${row.body}` : '[file]';
  return row.body || '';
}

function needsHumanEyes(row) {
  if (!row.media_type) return false;
  return !(row.media_type === 'audio' && row.transcript);
}

// -> { action: 'already_answered' | 'nothing' | 'reaction_ignored' |
//      'with_staff_notice' | 'media_notice' | 'classify', texts? }
export function decideSweepAction(rows, handedOver) {
  let lastClientIdx = -1;
  let lastClinicIdx = -1;
  rows.forEach((r, i) => {
    if (r.sender === 'client') lastClientIdx = i;
    else if (!r.is_notice) lastClinicIdx = i;
  });
  if (lastClientIdx >= 0 && rows.slice(lastClientIdx + 1).some((r) => r.sender === 'ai')) {
    return { action: 'already_answered' };
  }
  const unanswered = rows.slice(lastClinicIdx + 1).filter((r) => r.sender === 'client');
  if (unanswered.length === 0) return { action: 'nothing' };
  if (unanswered.every((r) => !r.media_type && isBareReaction(r.body))) return { action: 'reaction_ignored' };
  // "Ok" / "👍" to an automated reminder or payment message: nothing to say.
  if (rows[lastClinicIdx]?.sender === 'system' && unanswered.every((r) => !r.media_type && isAcknowledgementOnly(r.body))) {
    return { action: 'nothing' };
  }
  if (handedOver) {
    // A bare "Thanks" / "Ok" to staff needs no "still with our team".
    if (unanswered.every((r) => !r.media_type && isAcknowledgementOnly(r.body))) return { action: 'nothing' };
    return { action: 'with_staff_notice' };
  }
  if (unanswered.some(needsHumanEyes)) return { action: 'media_notice' };
  return { action: 'classify', texts: unanswered.map(unansweredText) };
}
