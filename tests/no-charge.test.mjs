// A consult item marked free shows on the bill at 0.00, "no charge"
// (lib/noCharge.js; Jim, 18 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNoChargeItem, isNoChargeLine, noChargeLine } from '../lib/noCharge.js';

const item = { id: 't1', visit_id: 'v1', billable: false, quantity: 1, instructions: '1 drop in each eye', goods_services: { id: 'g1', name: 'Eye drops' } };

test('a free consult item becomes a 0.00 line marked no charge', () => {
  assert.equal(isNoChargeItem(item), true);
  const line = noChargeLine(item, 'inv1');
  assert.equal(line.line_total, 0);
  assert.equal(line.unit_price, 0);
  assert.equal(line.description, 'Eye drops — 1 drop in each eye — no charge');
  assert.deepEqual(line.source_treatment_item_ids, ['t1']);
  assert.equal(isNoChargeLine(line), true);
});

test('a hospital stay unbilled item, or a charged one, is not', () => {
  assert.equal(isNoChargeItem({ ...item, hospitalization_note_id: 'n1', visit_id: null }), false);
  assert.equal(isNoChargeItem({ ...item, billable: true }), false);
  assert.equal(isNoChargeLine({ description: 'Eye drops', line_total: 25 }), false);
});
