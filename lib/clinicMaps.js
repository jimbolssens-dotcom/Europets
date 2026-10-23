// lib/clinicMaps.js
// The clinic's Google Maps link, sent with the address whenever someone
// asks where we are (the WhatsApp concierge, lib/whatsappConcierge.js).
// CLINIC_MAPS_URL pins an exact link (e.g. the "Share" link from the
// clinic's Google Maps listing); otherwise a Maps search for the clinic at
// its address. Pure, so it can be tested (tests/clinic-maps.test.mjs).

const DEFAULT_ADDRESS = 'Villa 341, Al Mirgab St., Al Qadisiya, Sharjah, UAE';

export function clinicMapsUrl(address = null, env = process.env) {
  if (env?.CLINIC_MAPS_URL) return env.CLINIC_MAPS_URL;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Europets Clinic, ${address || DEFAULT_ADDRESS}`)}`;
}

// A reply that gives the clinic's address (or says "here's our location")
// but no Maps link gets the link added on its own line.
export function withMapsLink(reply, mapsUrl) {
  const text = String(reply || '');
  if (!mapsUrl || /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)) return text;
  if (!/villa\s*341|mirgab|our location|our address|find us/i.test(text)) return text;
  return `${text.trimEnd()}\n\n📍 Google Maps: ${mapsUrl}`;
}
