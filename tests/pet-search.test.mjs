import { test } from 'node:test';
import assert from 'node:assert/strict';
import { petMatches, microchipMatches } from '../lib/petSearch.js';

const pet = { name: 'Ginger', patient_number: 23819, microchip_number: '784 0981 0012 3456' };
test('finds a pet by its microchip, with or without spaces', () => {
  assert.ok(petMatches(pet, '784098100123456'));
  assert.ok(petMatches(pet, '784 0981'));
  assert.ok(microchipMatches(pet, '3456'));
  assert.ok(!petMatches(pet, '999888777'));
  assert.ok(!microchipMatches({ name: 'No chip' }, '123'));
});
test('and still by name or patient number', () => {
  assert.ok(petMatches(pet, 'ging'));
  assert.ok(petMatches(pet, '23819'));
  assert.ok(petMatches(pet, ''));
});
