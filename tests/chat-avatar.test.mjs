// The picture beside a conversation in Messages (lib/chatAvatar.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatAvatar, initials, speciesIcon, avatarPets, avatarHue } from '../lib/chatAvatar.js';

test('pet photos first, living pets only, at most two', () => {
  const pets = [
    { name: 'A', species: 'Dog' },
    { name: 'B', species: 'Cat', profile_photo_url: 'https://x/b.jpg' },
    { name: 'C', species: 'Cat', profile_photo_url: 'https://x/c.jpg', deceased: true },
    { name: 'D', species: 'Cat', profile_photo_url: 'https://x/d.jpg' },
  ];
  assert.deepEqual(avatarPets(pets).map((p) => p.name), ['B', 'D']);
  const a = chatAvatar({ clientName: 'Owner', pets });
  assert.equal(a.kind, 'photos');
  assert.deepEqual(a.photos.map((p) => p.src), ['https://x/b.jpg', 'https://x/d.jpg']);
});

test('no photo: the first pet species', () => {
  const a = chatAvatar({ clientName: 'Owner', pets: [{ name: 'A', species: 'Feline' }] });
  assert.equal(a.kind, 'species');
  assert.equal(a.icon, '🐱');
  assert.equal(speciesIcon('Canine'), '🐶');
  assert.equal(speciesIcon(''), null);
});

test('no pets or unknown species: initials', () => {
  assert.deepEqual(chatAvatar({ clientName: 'Mary Ann Jones', pets: [] }).text, 'MJ');
  assert.equal(chatAvatar({ clientName: 'Sam', pets: [{ species: 'Alpaca' }] }).text, 'S');
  assert.equal(initials('+971 50 000 0000'), '?');
  assert.equal(initials(''), '?');
});

test('the same name keeps the same colour', () => {
  assert.equal(avatarHue('Owner One'), avatarHue('Owner One'));
  assert.ok(avatarHue('Owner One') >= 0 && avatarHue('Owner One') < 360);
});

test('the inbox API output keeps its photos when drawn', () => {
  const trimmed = avatarPets([{ name: 'B', species: 'Cat', profile_photo_url: 'https://x/b.jpg' }]);
  assert.equal(chatAvatar({ clientName: 'Owner', pets: trimmed }).kind, 'photos');
});
