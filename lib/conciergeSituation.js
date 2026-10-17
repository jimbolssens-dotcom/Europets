// lib/conciergeSituation.js
// What the WhatsApp concierge (lib/whatsappConcierge.js) is told about this
// moment, beyond the conversation itself. Pure, so it can be tested
// (tests/concierge-situation.test.mjs).

import { clinicClosedAt, RECEPTION_OPENS_HOUR, CLINIC_CLOSES_HOUR } from './clinicHours.js';

// UAE is UTC+4, no DST.
function uaeNow(at) {
  return new Date(at + 4 * 60 * 60 * 1000);
}

function uaeClock(now) {
  return uaeNow(now).toISOString().slice(11, 16);
}

// The time and whether we're open, who has the conversation, and what the
// client has already been told.
export function describeSituation({ rows, now = Date.now(), handedOver = false, staffEngaged = false, unregistered = false }) {
  const lines = [];
  const hour = uaeNow(now).getUTCHours();
  if (clinicClosedAt(now)) {
    const when = hour >= CLINIC_CLOSES_HOUR ? 'tomorrow' : 'this morning';
    lines.push(
      `It is ${uaeClock(now)} UAE time and the clinic is CLOSED: reception opens at ${RECEPTION_OPENS_HOUR}:00 ${when}. Nobody at the clinic will normally see a message before then, so never say anyone will reply soon or shortly.`
    );
  } else {
    lines.push(`It is ${uaeClock(now)} UAE time and the clinic is open (until ${CLINIC_CLOSES_HOUR}:00); the team sees messages during the day, though they may be busy with patients.`);
  }
  if (unregistered) {
    lines.push("This number isn't linked to any client on file, so you can't look up or book anything for them. Answer a simple question about the clinic if that's all they ask; anything about a pet or a booking needs a person (hand_to_staff), who will set them up.");
  }
  if (handedOver) {
    lines.push('This conversation has been handed to staff and nobody has replied yet. A person will deal with it: don\'t answer or book anything yourself.');
  } else if (staffEngaged) {
    const lastStaff = [...rows].reverse().find((r) => r.sender === 'staff');
    const mins = lastStaff ? Math.max(1, Math.round((now - Date.parse(lastStaff.created_at)) / 60000)) : null;
    lines.push(`A member of staff is talking with this client${mins ? ` (they last wrote ${mins} minutes ago)` : ''}. Don't answer or book anything yourself: leave it to them.`);
  }
  // A holding message already sent since the clinic last really replied.
  let told = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (!r.is_notice && (r.sender === 'staff' || r.sender === 'ai' || r.sender === 'system')) break;
    if (r.is_notice) {
      told = r;
      break;
    }
  }
  if (told) {
    lines.push(`Since the clinic last replied, the client has already been told (at ${uaeClock(Date.parse(told.created_at))}): "${told.body}". Don't say it again.`);
  }
  return lines.map((l) => `- ${l}`).join('\n');
}

