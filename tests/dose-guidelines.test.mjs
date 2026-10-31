import test from 'node:test';
import assert from 'node:assert/strict';
import { guidelinesFor, proposedAmount, checkDose, formatAmount, guidelineLine, roundAmount, NEEDS_REASON } from '../lib/doseGuidelines.js';

const at = '2026-10-31T08:00:00Z';
const convenia = { goods_service_id: 'conv', species: 'any', rule: 'mg_per_kg', strength: 80, dose_unit: 'ml', dose_per_kg: 8, min_per_kg: 7, max_per_kg: 9, round_to: 0.01, frequency: 'once', approved_at: at };
const melCat = { goods_service_id: 'mel', species: 'cat', rule: 'mg_per_kg', strength: 5, dose_unit: 'ml', dose_per_kg: 0.2, min_per_kg: 0.1, max_per_kg: 0.3, round_to: 0.01, approved_at: at };
const melDog = { ...melCat, species: 'dog', max_per_kg: 0.2 };
const vermis = { goods_service_id: 'verm', species: 'any', rule: 'bands', dose_unit: 'tablet', bands: [{ max_kg: 2.5, amount: 0.25 }, { max_kg: 5, amount: 0.5 }, { max_kg: 10, amount: 1 }, { max_kg: 20, amount: 2 }], band_step_kg: 10, band_step_amount: 1, approved_at: at };

test('picks the species row, else the any row; only approved ones', () => {
  const all = [melCat, melDog, convenia, { ...convenia, goods_service_id: 'draft', approved_at: null }];
  assert.equal(guidelinesFor(all, 'mel', 'Cat')[0], melCat);
  assert.equal(guidelinesFor(all, 'mel', 'canine')[0], melDog);
  assert.equal(guidelinesFor(all, 'conv', 'cat')[0], convenia);
  assert.deepEqual(guidelinesFor(all, 'draft', 'cat'), []);
});

test('fills in the amount from the weight', () => {
  assert.equal(proposedAmount(convenia, 4.2), 0.42); // 8 x 4.2 / 80
  assert.equal(proposedAmount(melCat, 4.2), 0.17);
  assert.equal(proposedAmount(convenia, null), null);
  const doxy40 = { rule: 'mg_per_kg', strength: 40, dose_per_kg: 10, round_to: 0.25, dose_unit: 'tablet' };
  assert.equal(proposedAmount(doxy40, 3), 0.75);
  assert.equal(proposedAmount(doxy40, 0.5), 0.25); // never rounds down to nothing
  const librela10 = { rule: 'mg_per_kg', strength: 10, dose_per_kg: 0.5, min_per_kg: 0.5, max_per_kg: 1, round_to: 1, dose_unit: 'vial' };
  assert.equal(proposedAmount(librela10, 15), 1);
  assert.equal(checkDose(librela10, 1, 15).level, 'ok');
});

test("the dewormer by Dr Jim's weight bands", () => {
  assert.deepEqual([2, 2.5, 4, 7, 10, 15, 20, 25, 30, 31].map((kg) => proposedAmount(vermis, kg)), [0.25, 0.25, 0.5, 1, 1, 2, 2, 3, 3, 4]);
  assert.equal(formatAmount(0.25, 'tablet'), '¼ tablet');
  assert.equal(formatAmount(1.5, 'tablet'), '1½ tablets');
  assert.equal(formatAmount(2, 'tablet'), '2 tablets');
});

test('fixed and per-kg amounts', () => {
  const troyCat = { rule: 'per_animal', fixed_amount: 0.5, dose_unit: 'ml' };
  const troyDog = { rule: 'per_kg_amount', amount_per_kg: 0.1, round_to: 0.1, dose_unit: 'ml' };
  assert.equal(proposedAmount(troyCat, 4), 0.5);
  assert.equal(proposedAmount(troyDog, 20), 2);
  assert.equal(checkDose(troyDog, 2, 20).level, 'ok');
  assert.equal(checkDose(troyDog, 5, 20).level, 'over');
  const bravecto = { rule: 'per_animal', fixed_amount: 1, dose_unit: 'tablet', weight_min_kg: 10, weight_max_kg: 20 };
  assert.equal(checkDose(bravecto, 1, 15).level, 'ok');
  assert.equal(checkDose(bravecto, 1, 30).level, 'over');
});

test('real doses from the records come out as expected', () => {
  // 1 ml meloxicam in a 2.18 kg cat: 2.29 mg/kg, well over.
  const c1 = checkDose(melCat, 1, 2.18);
  assert.equal(c1.level, 'over');
  assert.match(c1.text, /7.65× the maximum/);
  // 0.2 ml in a 4.8 kg cat: in range.
  assert.equal(checkDose(melCat, 0.2, 4.8).level, 'ok');
  // Convenia 1 ml in a 3 kg cat: 26.7 mg/kg.
  assert.equal(checkDose(convenia, 1, 3).level, 'over');
  // Convenia 0.5 ml in a 4.8 kg cat: 8.3 mg/kg, fine.
  assert.equal(checkDose(convenia, 0.5, 4.8).level, 'ok');
  // Slightly off is amber, not red.
  assert.equal(checkDose(convenia, 0.45, 3.9).level, 'high'); // 9.2 mg/kg
  assert.equal(checkDose(convenia, 0.1, 5).level, 'under'); // 1.6 mg/kg
  assert.ok(NEEDS_REASON.has('over') && NEEDS_REASON.has('under') && !NEEDS_REASON.has('high'));
  assert.equal(checkDose(convenia, 0.5, null).level, 'noweight');
});

test('the guideline line staff see', () => {
  assert.equal(guidelineLine(convenia, 4.2), 'For 4.2 kg: 0.42 ml (8 mg/kg), once');
  assert.equal(roundAmount(0.336, 0.01), 0.34);
});
