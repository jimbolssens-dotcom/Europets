import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftText } from '../lib/socialDraftPrompt.js';
import { approvalBlocker, postConsent } from '../lib/socialPosts.js';

test('the AI gets the staff line, the pet basics and the voice examples, never the owner', () => {
  const text = buildDraftText({
    story: 'Home after his dental',
    patient: { name: 'Milo', species: 'cat', breed: 'DSH', sex: 'male', date_of_birth: '2017-09-01' },
    recentVisit: { created_at: '2026-10-18T08:00:00Z', diagnosis: 'Dental disease', treatment_notes: 'Three extractions.' },
    mediaKinds: ['image', 'video'],
    examples: ['A caption we liked'],
    now: Date.parse('2026-10-19T08:00:00Z'),
  });
  assert.match(text, /Home after his dental/);
  assert.match(text, /name Milo, cat, DSH, male, 9 years old/);
  assert.match(text, /0: photo, 1: a still from a video/);
  assert.match(text, /A caption we liked/);
  assert.doesNotMatch(text, /owner/i);
});

test('without a patient the AI is told not to name animals', () => {
  assert.match(buildDraftText({ story: '', mediaKinds: ['image'] }), /don't name them/);
});

test('a post with a pet needs the owner to have said yes', () => {
  const base = { media: [{ path: 'social/x/a.jpg', kind: 'image' }], caption_instagram: 'Hi' };
  assert.equal(postConsent(base), 'none');
  assert.equal(approvalBlocker(base), null);
  const withPet = (answer) => ({ ...base, patient_id: 'p1', patients: { clients: { social_media_consent: answer } } });
  assert.equal(approvalBlocker(withPet(true)), null);
  assert.match(approvalBlocker(withPet(false)), /said no/);
  assert.match(approvalBlocker(withPet(null)), /hasn't been asked/);
  assert.match(approvalBlocker({ ...base, media: [{ path: 'a', kind: 'image', excluded: true }] }), /Every photo is left out/);
  assert.match(approvalBlocker({ ...base, caption_instagram: ' ' }), /no caption/);
});
