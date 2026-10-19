import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInstagramHandle } from '../lib/clinicSocial.js';
import { buildDraftText, withOwnerTag } from '../lib/socialDraftPrompt.js';
import { buildPlanText } from '../lib/socialPlanPrompt.js';

test('an owner\'s Instagram handle is cleaned up however it was typed', () => {
  assert.equal(normalizeInstagramHandle('@Bella.Mum'), 'bella.mum');
  assert.equal(normalizeInstagramHandle('https://www.instagram.com/bella_mum/?hl=en'), 'bella_mum');
  assert.equal(normalizeInstagramHandle('instagram.com/Bella_Mum'), 'bella_mum');
  assert.equal(normalizeInstagramHandle('  '), null);
  assert.equal(normalizeInstagramHandle('bella mum'), null); // spaces aren't allowed
  assert.equal(normalizeInstagramHandle('bella..mum'), null);
  assert.equal(normalizeInstagramHandle('a'.repeat(31)), null);
});

test('a post about a client\'s pet tags the owner, above the hashtags', () => {
  const text = buildDraftText({ story: 'Home after his dental', patient: { name: 'Milo' }, mediaKinds: ['image'], ownerInstagram: 'bella.mum' });
  assert.match(text, /mention @bella\.mum exactly once in the Instagram caption/);
  assert.doesNotMatch(buildDraftText({ story: '', patient: { name: 'Milo' }, mediaKinds: ['image'] }), /@/);
  assert.equal(withOwnerTag('Milo went home.\n\n#EuropetsClinic', 'bella.mum'), 'Milo went home.\n\n📸 with @bella.mum\n\n#EuropetsClinic');
  assert.equal(withOwnerTag('Milo went home.', 'bella.mum'), 'Milo went home.\n\n📸 with @bella.mum');
});

test('the weekly plan is grounded in the clinic\'s real week and avoids repeats', () => {
  const text = buildPlanText({
    weekStart: '2026-10-19',
    uaeDateLabel: 'Monday, 19 October 2026',
    activity: { consults: 250, dentals: 12, catteryGuests: 3, upcomingSurgeries: 9, topProcedures: ['spay (5)'], species: { cat: 120, dog: 100 } },
    recentTitles: ['Home after his dental'],
  });
  assert.match(text, /250 consults/);
  assert.match(text, /12 dentals/);
  assert.match(text, /Cattery guests right now: 3/);
  assert.match(text, /9 surgeries/);
  assert.match(text, /120 cat, 100 dog/);
  assert.match(text, /don't repeat\): Home after his dental/);
  assert.match(buildPlanText({ weekStart: '2026-10-19', uaeDateLabel: 'x', activity: {} }), /introduce the clinic and the team/);
});
