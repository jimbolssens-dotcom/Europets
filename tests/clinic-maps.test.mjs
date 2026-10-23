import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicMapsUrl, withMapsLink } from '../lib/clinicMaps.js';

const url = clinicMapsUrl({});

test("the clinic's own Maps listing, unless overridden", () => {
  assert.equal(url, 'https://maps.app.goo.gl/3m1vudnJHh9dpf8J7');
  assert.equal(clinicMapsUrl({ CLINIC_MAPS_URL: 'https://maps.app.goo.gl/abc' }), 'https://maps.app.goo.gl/abc');
});

// 23 Oct: "Please send me the location" got the address with no link.
test("the address always goes with the Maps link", () => {
  const reply = "Of course! Here's our location:\n\nVilla 341, Mirgab St. Al Quadsia, Sharjah, UAE\n\nSee you tomorrow with Leo!";
  assert.match(withMapsLink(reply, url), /\n\n📍 Google Maps: https:\/\/maps\.app\.goo\.gl\/3m1vudnJHh9dpf8J7$/);
  assert.equal(withMapsLink(`${reply}\n${url}`, url), `${reply}\n${url}`);
  assert.equal(withMapsLink('See you tomorrow!', url), 'See you tomorrow!');
});
