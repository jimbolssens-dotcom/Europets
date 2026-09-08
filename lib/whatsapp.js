// lib/whatsapp.js
// Opens a WhatsApp chat with a pre-filled message via the whatsapp://
// desktop/mobile app URI scheme — not the https://wa.me/api.whatsapp.com
// web fallback every "send via WhatsApp" button used to link to. The
// whole staff side of this app runs from office desktops with WhatsApp
// Desktop installed, and wa.me/api.whatsapp.com always shows a "Continue
// to WhatsApp Web / Open app" landing page first in a desktop browser — an
// extra click nobody here ever wants, since WhatsApp Web itself is never
// actually used. whatsapp:// hands off straight to the installed app, no
// landing page. (The client-facing website/ pages intentionally keep using
// wa.me instead — a pet owner's own device may not have WhatsApp Desktop,
// and wa.me already deep-links cleanly there, especially on mobile.)
//
// Returns false (and does nothing) when there's no usable phone number —
// callers disable/skip the triggering action in that case.
export function openWhatsApp(phone, message) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return false;
  window.location.href = `whatsapp://send?phone=${digits}&text=${encodeURIComponent(message)}`;
  return true;
}
