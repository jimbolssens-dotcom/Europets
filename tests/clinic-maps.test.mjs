import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicMapsUrl, withMapsLink } from '../lib/clinicMaps.js';

const url = clinicMapsUrl(null, {});

test('a pinned link wins, else a Maps search for the clinic', () => {
  assert.equal(clinicMapsUrl(null, { CLINIC_MAPS_URL: 'https://maps.app.goo.gl/abc' }), 'https://maps.app.goo.gl/abc');
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Europets%20Clinic%2C%20Villa%20341/);
});

// 23 Oct: "Please send me the location" got the address with no link.
test("the address always goes with the Maps link", () => {
  const reply = "Of course! Here's our location:\n\nVilla 341, Mirgab St. Al Quadsia, Sharjah, UAE\n\nSee you tomorrow with Leo!";
  assert.match(withMapsLink(reply, url), /\n\n📍 Google Maps: https:\/\/www\.google\.com\/maps/);
  assert.equal(withMapsLink(`${reply}\n${url}`, url), `${reply}\n${url}`);
  assert.equal(withMapsLink('See you tomorrow!', url), 'See you tomorrow!');
});
