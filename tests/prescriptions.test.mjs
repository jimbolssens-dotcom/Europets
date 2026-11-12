import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRxItems, rxMedName, rxNumber } from '../lib/prescriptions.js';

test('a prescription needs a name, how much and how to give each medicine', () => {
  assert.equal(cleanRxItems([]).error, 'Add at least one medicine');
  assert.match(cleanRxItems([{ name: 'Augmentin 625mg', quantity: '28 tablets' }]).error, /how to give/);
  assert.match(cleanRxItems([{ name: 'Augmentin 625mg', directions: '1 tablet twice daily' }]).error, /how much/);
  const { items } = cleanRxItems([
    { name: 'Augmentin 625mg ^', strength: '625 mg', quantity: '28 tablets', directions: '1 tablet twice daily with food', duration: '14 days' },
    { name: '', strength: '', quantity: '', directions: '' },
  ]);
  assert.deepEqual(items, [{ name: 'Augmentin 625mg', strength: '625 mg', quantity: '28 tablets', duration: '14 days', directions: '1 tablet twice daily with food' }]);
});

test('names and numbers read cleanly', () => {
  assert.equal(rxMedName('Metacam 0.5mg/ml (per ml) ^'), 'Metacam 0.5mg/ml');
  assert.equal(rxNumber(42), 'RX-000042');
});
