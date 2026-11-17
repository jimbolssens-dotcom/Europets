// The pet(s) on each invoice in the client app list (lib/invoicePets.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicePetsLabel as label } from '../lib/invoicePets.js';
const invoicePetsLabel = (inv) => label(inv).replace(/\u00a0/g, ' ');

test('a consult or stay invoice shows its pet and number', () => {
  assert.equal(invoicePetsLabel({ visits: { patients: { name: 'Bella', patient_number: 24241 } } }), 'Bella #24241');
  assert.equal(invoicePetsLabel({ hospitalizations: { patients: { name: 'Max', patient_number: 12 } } }), 'Max #12');
});

test('a cattery invoice shows every cat in the bungalow, once each', () => {
  const inv = { cattery_bookings: [{ patients: { name: 'Plomo', patient_number: 1 }, cattery_booking_cats: [{ patients: { name: 'Cami', patient_number: 2 } }] }] };
  assert.equal(invoicePetsLabel(inv), 'Plomo #1, Cami #2');
  const both = { visits: { patients: { name: 'Max', patient_number: 12 } }, hospitalizations: { patients: { name: 'Max', patient_number: 12 } } };
  assert.equal(invoicePetsLabel(both), 'Max #12');
});

test('a product sale shows nothing', () => {
  assert.equal(invoicePetsLabel({ visits: null, hospitalizations: null, cattery_bookings: [] }), '');
});

test('a name and its number stay together', () => {
  assert.equal(label({ visits: { patients: { name: 'Cami', patient_number: 24241 } } }), 'Cami\u00a0#24241');
});
