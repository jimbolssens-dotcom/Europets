// lib/clinicHours.js
// When the clinic is closed, for the automatic WhatsApp notices: reception
// opens at 08:00 and the clinic closes at 19:00, every day, UAE time
// (UTC+4, no DST). Pure, so it can be tested directly.
//
// A real night: a kitten owner writing between 02:55 and 05:50 got "a member
// of our team will be with you shortly" six times. Nobody was there, and
// "shortly" read as minutes. The concierge is now told whether we're open
// (describeSituation in lib/whatsappConcierge.js) and writes accordingly.

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

// The line sent only when the AI itself fails while handing a message to
// staff (lib/whatsappConcierge.js): every other message is written by the AI
// for what the client said. Short, and honest about when they'll hear back.
export function fallbackHoldingText(now = Date.now()) {
  if (!clinicClosedAt(now)) return "Thanks for your message, we've passed it to the team and they'll get back to you.";
  const { hour } = uaeParts(now);
  return `Thanks for your message, we've passed it to the team, who will get back to you when we open at 8:00${hour >= CLINIC_CLOSES_HOUR ? ' tomorrow' : ''}.`;
}
