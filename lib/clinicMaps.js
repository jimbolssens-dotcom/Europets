// lib/clinicMaps.js
// The clinic's Google Maps link, sent with the address whenever someone
// asks where we are (the WhatsApp concierge, lib/whatsappConcierge.js):
// the clinic's own Google Maps listing (Jim, 23 Oct). CLINIC_MAPS_URL can
// override it. Pure, so it can be tested (tests/clinic-maps.test.mjs).

export const CLINIC_LISTING_URL = 'https://maps.app.goo.gl/3m1vudnJHh9dpf8J7';

export function clinicMapsUrl(env = process.env) {
  return env?.CLINIC_MAPS_URL || CLINIC_LISTING_URL;
}

// A reply that gives the clinic's address (or says "here's our location")
// but no Maps link gets the link added on its own line.
export function withMapsLink(reply, mapsUrl) {
  const text = String(reply || '');
  if (!mapsUrl || /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)) return text;
  if (!/villa\s*341|mirgab|our location|our address|find us/i.test(text)) return text;
  return `${text.trimEnd()}\n\n📍 Google Maps: ${mapsUrl}`;
}
