// lib/whatsappWindow.js
// Pure part of lib/whatsappReplyTarget.js (no database), so it's testable.
//
// The 24-hour window belongs to a NUMBER, not to a client: a client who
// writes from their second phone opens a window on that phone only, and a
// reply to their main number then fails with Meta's #131047 (a grieving
// owner got two "Not delivered" condolences that way, 25 Nov). So answer
// the number they last wrote from while its window is open; otherwise use
// the main number with the window closed (callers send the approved
// template or skip).

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

const onlyDigits = (v) => (v || '').replace(/\D/g, '');

// mainPhone: clients.phone. lastInbound: the client's latest WhatsApp
// message to us ({ created_at, phone }) or null.
export function pickWhatsAppTarget({ mainPhone, lastInbound, now = Date.now() }) {
  const mainDigits = onlyDigits(mainPhone);
  const lastDigits = onlyDigits(lastInbound?.phone);
  const recent = !!lastInbound && now - new Date(lastInbound.created_at).getTime() < WHATSAPP_WINDOW_MS;
  // The webhook stores the sender's number on every inbound row.
  if (recent && lastDigits) return { digits: lastDigits, windowOpen: true };
  return { digits: mainDigits || lastDigits, windowOpen: false };
}
