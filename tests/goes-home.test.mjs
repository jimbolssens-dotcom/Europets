// "🏠 Goes home", apart from the dispensing fee (lib/goesHome.js, migration 254).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemGoesHome, lineGoesHome, homeStyleInstructions } from '../lib/goesHome.js';
import { medsFromTreatmentItems } from '../lib/homeCare.js';

test('a tap on the chip wins either way', () => {
  assert.equal(itemGoesHome({ goes_home: true, administration_method: 'sc' }), true);
  assert.equal(itemGoesHome({ goes_home: false, administration_method: 'dispense' }), false);
});

test('dispensed goes home; a hospital dose does not, unless dispensed', () => {
  assert.equal(itemGoesHome({ administration_method: 'dispense' }), true);
  assert.equal(itemGoesHome({ administration_method: 'dispense', hospitalization_note_id: 'n' }), true);
  assert.equal(itemGoesHome({ hospitalization_note_id: 'n', goods_services: { usually_goes_home: true }, instructions: 'twice daily' }), false);
});

test('the catalog default and home-style instructions turn it on, without the fee', () => {
  assert.equal(itemGoesHome({ administration_method: null, goods_services: { usually_goes_home: true } }), true);
  assert.equal(itemGoesHome({ instructions: '1 capsule once daily for 10 days' }), true);
  assert.equal(itemGoesHome({ instructions: '0.4 ml SC' }), false);
  assert.equal(itemGoesHome({ administration_method: 'sc', instructions: '' }), false);
  for (const s of ['BID for 5 days', 'every 12 hours', 'twice a day', 'morning and evening']) assert.ok(homeStyleInstructions(s), s);
});

test('an invoice line goes home when dispensed or made from a line that does', () => {
  assert.equal(lineGoesHome({ administration_method: 'dispense' }), true);
  assert.equal(lineGoesHome({}, [{ goods_services: { usually_goes_home: true } }]), true);
  assert.equal(lineGoesHome({}, [{ administration_method: 'sc' }]), false);
});

test('Home care offers a medicine that goes home without being dispensed', () => {
  const meds = medsFromTreatmentItems([
    { id: 'a', administration_method: null, goods_services: { name: 'Bravecto Dog 250mg ^', usually_goes_home: true }, instructions: '1 chew with food' },
    { id: 'b', administration_method: 'sc', goods_services: { name: 'Maropitant 10mg/ml' } },
  ]);
  assert.deepEqual(meds.map((m) => m.name), ['Bravecto Dog 250mg']);
});
