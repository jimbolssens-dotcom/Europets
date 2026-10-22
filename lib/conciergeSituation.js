// lib/conciergeSituation.js
// What the WhatsApp concierge (lib/whatsappConcierge.js) is told about this
// moment, beyond the conversation itself. Pure, so it can be tested
// (tests/concierge-situation.test.mjs).

import { INSTAGRAM_SHORT } from './clinicSocial.js';
import { clinicClosedAt, RECEPTION_OPENS_HOUR, CLINIC_CLOSES_HOUR } from './clinicHours.js';
import { CONSULT_DURATION_MINUTES } from './appointmentScheduling.js';

// UAE is UTC+4, no DST.
function uaeNow(at) {
  return new Date(at + 4 * 60 * 60 * 1000);
}

function uaeClock(now) {
  return uaeNow(now).toISOString().slice(11, 16);
}

// The time and whether we're open, who has the conversation, and what the
// client has already been told.
export function describeSituation({ rows, now = Date.now(), handedOver = false, staffEngaged = false, unregistered = false, mayInviteInstagram = false }) {
  const lines = [];
  const hour = uaeNow(now).getUTCHours();
  if (clinicClosedAt(now)) {
    const when = hour >= CLINIC_CLOSES_HOUR ? 'tomorrow' : 'this morning';
    lines.push(
      `It is ${uaeClock(now)} UAE time and the clinic is CLOSED: reception opens at ${RECEPTION_OPENS_HOUR}:00 ${when}. Nobody at the clinic will normally see a message before then, so never say anyone will reply soon or shortly.`
    );
  } else {
    // "Shortly" was followed by two-hour waits (review of 22 Oct).
    lines.push(
      `It is ${uaeClock(now)} UAE time and the clinic is open (until ${CLINIC_CLOSES_HOUR}:00); the team sees messages during the day, though they may be with patients for an hour or two. When you say the team will get back to the client, say they'll come back "as soon as they can", never "shortly" or "soon".`
    );
  }
  if (unregistered) {
    lines.push(
      "This number isn't linked to any client on file, so you can't look up or book anything for them yet. If they want to book anything or bring a pet in, the way to get there is our new-client form: call send_intake_link and put their link in your reply, warmly and simply (it takes a couple of minutes; they can say in it what they'd like booked and when, and the team confirms the booking once it's in). Encourage them to fill it in rather than just handing over. Answer a simple question about the clinic directly. Anything medical, urgent, or that a person must see still goes to staff (hand_to_staff), and you can include the form link in that message too."
    );
  }
  if (handedOver) {
    // A simple question after a handover used to wait for staff too: the
    // clinic's address went unanswered overnight (review of 22 Oct).
    lines.push(
      "This conversation has been handed to staff and nobody has replied yet. A person will deal with what was handed over: don't book, move or cancel anything, and don't answer anything medical, about money or about what was handed over. You may still answer a simple question yourself, in one or two short sentences, when the answer is about the clinic (the address, opening hours) or plainly in what's on file (what's booked and when). If the client asks something new and different that needs a person, hand_to_staff again with new_question set, and say briefly that you've passed that on too."
    );
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
  // At most once in INSTAGRAM_INVITE_DAYS per client (the caller checks),
  // and only on a good note: never pushed into a worried conversation.
  if (mayInviteInstagram && !handedOver && !staffEngaged) {
    lines.push(
      `If this exchange comes to a happy, natural close (they thank you, or a booking or question is settled), you may end your reply with one short, friendly line inviting them to follow us on Instagram to see our patients and the team: ${INSTAGRAM_SHORT}. Only then: never when their pet is unwell, in pain, has died, or the client is worried, upset or waiting on something, and never as the main point of a reply.`
    );
  }
  return lines.map((l) => `- ${l}`).join('\n');
}


function uaeDate(at) {
  return uaeNow(at).toISOString().slice(0, 10);
}

// Why an appointment can't be moved by the concierge (null = it can).
// A consult today or tomorrow morning can be moved too (it used to need 24
// hours' notice, and same-day "can I move it to tomorrow?" kept going to
// the team; changed with Jim's OK, review of 22 Oct), but only to a later
// day: see whyNotMovableTo.
export function whyNotMovable(appt, now = Date.now()) {
  if (!['consult', 'video'].includes(appt.type)) return 'a surgery or procedure: staff move these (fasting and drop-off)';
  if (appt.status !== 'booked') return `it is ${String(appt.status).replace('_', ' ')}`;
  if (new Date(appt.start_time).getTime() <= now) return 'its time has already passed';
  if (Number(appt.duration_minutes) !== CONSULT_DURATION_MINUTES) return 'it is a longer, specially booked consult';
  return null;
}

// Why it can't be moved to this new time (null = it can): a move into
// today is the team's to fit in, whatever the appointment.
export function whyNotMovableTo(appt, newStart, now = Date.now()) {
  const why = whyNotMovable(appt, now);
  if (why) return why;
  if (uaeDate(Date.parse(newStart)) <= uaeDate(now)) return 'the new time is today, and same-day changes are arranged by the team';
  return null;
}

// Starts today (UAE): it can only be moved to another day.
export function onlyToAnotherDay(appt, now = Date.now()) {
  return uaeDate(Date.parse(appt.start_time)) === uaeDate(now);
}

// Said next to each upcoming appointment in what's on file, so the model
// knows before offering any times that it can't move one. A real case
// (21 Oct): a consult that afternoon was in the facts, the model skipped
// list_upcoming_appointments, offered five new times for the next morning,
// and only when the client picked one said it couldn't move it.
export function movableNote(appt, now = Date.now()) {
  const why = whyNotMovable(appt, now);
  if (!why) {
    return onlyToAnotherDay(appt, now)
      ? '. You can move it to another day yourself (offer times from tomorrow on); a new time later today is for the team to arrange'
      : '';
  }
  return `. You can't move this one yourself (${why}): if they want to change it, don't offer any new times, say the team will arrange the change with them, and hand it to staff`;
}
