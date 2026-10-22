import test from 'node:test';
import assert from 'node:assert/strict';
import { bonusFor, promotionCovers, planBonusDiscounts, discountForBillAmount, billAmountForDiscount } from '../lib/supporterBonusPlan.js';
import { bonusFor as websiteBonusFor } from '../website/lib/payLinkRules.js';

// What Jim set for the first rescuer (22 Oct 2026).
const tiers = [{ min: 500, bonus: 50 }, { min: 1000, bonus: 150 }, { min: 2000, bonus: 400 }];

test('a gift earns the highest tier it reaches, the same on the website', () => {
  for (const check of [bonusFor, websiteBonusFor]) {
    assert.equal(check(tiers, 499.99), 0);
    assert.equal(check(tiers, 500), 50);
    assert.equal(check(tiers, 999), 50);
    assert.equal(check(tiers, 1000), 150);
    assert.equal(check(tiers, 1999), 150);
    assert.equal(check(tiers, 2000), 400);
    assert.equal(check(tiers, 5000), 400);
    assert.equal(check([], 5000), 0);
  }
});

test('only gifts inside the promotion count', () => {
  const promo = { active: true, starts_at: '2026-10-22T00:00:00Z', ends_at: '2026-12-31T20:00:00Z' };
  assert.ok(promotionCovers(promo, '2026-10-23T10:00:00Z'));
  assert.ok(!promotionCovers(promo, '2026-10-21T10:00:00Z'));
  assert.ok(!promotionCovers(promo, '2027-01-02T10:00:00Z'));
  assert.ok(!promotionCovers({ ...promo, active: false }, '2026-10-23T10:00:00Z'));
  assert.ok(promotionCovers({ ...promo, ends_at: null }, '2030-01-01T00:00:00Z'));
});

test('a bonus takes exactly its amount off the bill, VAT included', () => {
  for (const amount of [50, 150, 400, 33.33]) assert.equal(billAmountForDiscount(discountForBillAmount(amount)), amount);
});

test('bonuses go on the oldest bills first, never more than a bill still owes', () => {
  const invoices = [
    { id: 'i1', total: 105, amount_paid: 0, subtotal: 100, discount_amount: 0 },
    { id: 'i2', total: 1050, amount_paid: 1000, subtotal: 1000, discount_amount: 0 },
    { id: 'i3', total: 525, amount_paid: 0, subtotal: 500, discount_amount: 0 },
  ];
  assert.deepEqual(planBonusDiscounts([{ id: 'b1', remaining: 150 }, { id: 'b2', remaining: 50 }], invoices), [
    { bonus_id: 'b1', invoice_id: 'i1', bill_amount: 105 },
    { bonus_id: 'b1', invoice_id: 'i2', bill_amount: 45 },
    { bonus_id: 'b2', invoice_id: 'i2', bill_amount: 5 },
    { bonus_id: 'b2', invoice_id: 'i3', bill_amount: 45 },
  ]);
  // Nothing open: the bonus waits for the next invoice.
  assert.deepEqual(planBonusDiscounts([{ id: 'b1', remaining: 150 }], []), []);
});
