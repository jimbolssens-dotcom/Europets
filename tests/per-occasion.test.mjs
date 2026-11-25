import test from 'node:test';
import assert from 'node:assert/strict';
import { perOccasionQuantityError } from '../lib/perOccasion.js';

const subq = { name: 'Subcutanous fluids', charge_per_occasion: true };

test('SubQ: a number of sessions is fine', () => {
  assert.equal(perOccasionQuantityError(subq, 1), null);
  assert.equal(perOccasionQuantityError(subq, 2), null);
});

test('SubQ: ml typed as the quantity is refused', () => {
  assert.match(perOccasionQuantityError(subq, 180), /once per session/);
  assert.match(perOccasionQuantityError(subq, 0.25), /once per session/);
  assert.match(perOccasionQuantityError(subq, 11), /once per session/);
});

test('items charged by amount are not affected', () => {
  assert.equal(perOccasionQuantityError({ name: 'Cerenia inj (per ml)', charge_per_occasion: false }, 0.5), null);
  assert.equal(perOccasionQuantityError(null, 180), null);
});
