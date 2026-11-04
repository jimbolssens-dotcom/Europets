import test from 'node:test';
import assert from 'node:assert/strict';
import { isBirdSpecies } from '../lib/birdSpecies.js';

test('birds, however the species is written', () => {
  for (const s of ['Bird', 'parrot', 'Parakeet ', 'African Grey', 'macaw', 'Cockatoo', 'budgie', 'lovebird', 'Pigeon', 'owl', 'falcon', 'Chicken']) {
    assert.equal(isBirdSpecies(s), true, s);
  }
});

test('not birds', () => {
  for (const s of ['Cat', 'dog', 'rabbit', 'Guinea pig', 'turtle', 'unknown', '', null, 'hamster', 'ferret']) {
    assert.equal(isBirdSpecies(s), false, String(s));
  }
});
