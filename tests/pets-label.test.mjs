import test from 'node:test';
import assert from 'node:assert/strict';
import { petsLabel } from '../lib/petsLabel.js';

test('the pet the invoice is for, by name', () => {
  assert.equal(petsLabel(['Istanah']), 'Istanah');
  assert.equal(petsLabel(['Luna', ' Max ', 'Luna']), 'Luna and Max');
  assert.equal(petsLabel(['A', 'B', 'C']), 'your pets');
  assert.equal(petsLabel([]), 'your pet');
  assert.equal(petsLabel([null, '']), 'your pet');
});
