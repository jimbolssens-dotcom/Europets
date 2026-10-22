import test from 'node:test';
import assert from 'node:assert/strict';
import { planCreditApplication, creditPaidAt, isFreshPayment, payLinkAmountError, PAY_LINK_MIN, PAY_LINK_MAX } from '../lib/clientCreditPlan.js';
import { payLinkAmountError as websiteAmountError, PAY_LINK_MIN as WMIN, PAY_LINK_MAX as WMAX } from '../website/lib/payLinkRules.js';

test('money paid in fills the oldest invoices first, oldest money first, the rest kept', () => {
  const credits = [{ donation_id: 'd1', remaining: 100 }, { donation_id: 'd2', remaining: 300 }];
  const invoices = [
    { id: 'i1', total: 150, amount_paid: 20 },
    { id: 'i2', total: 99.99, amount_paid: 0 },
  ];
  assert.deepEqual(planCreditApplication(credits, invoices), [
    { donation_id: 'd1', invoice_id: 'i1', amount: 100 },
    { donation_id: 'd2', invoice_id: 'i1', amount: 30 },
    { donation_id: 'd2', invoice_id: 'i2', amount: 99.99 },
  ]);
  // 300 - 30 - 99.99 = 170.01 left as credit: nothing more is planned.
  assert.deepEqual(planCreditApplication([{ donation_id: 'd', remaining: 50 }], []), []);
  assert.deepEqual(planCreditApplication([{ donation_id: 'd', remaining: 0 }], invoices), []);
  assert.deepEqual(planCreditApplication(credits, [{ id: 'paid', total: 50, amount_paid: 50 }]), []);
});

test('credit pays a later invoice on the day of the invoice, a fresh payment on the day it came in', () => {
  assert.equal(creditPaidAt('2026-10-20T08:00:00.000Z', '2026-10-25T10:00:00.000Z'), '2026-10-25T10:00:00.000Z');
  assert.equal(creditPaidAt('2026-10-20T08:00:00.000Z', '2026-10-01T10:00:00.000Z'), '2026-10-20T08:00:00.000Z');
  const now = Date.parse('2026-10-22T10:00:00Z');
  assert.ok(isFreshPayment('2026-10-22T09:30:00Z', now));
  assert.ok(!isFreshPayment('2026-10-20T09:30:00Z', now));
});

test('the link takes AED 20 to 5,000, the same on the website and in the app', () => {
  assert.equal(WMIN, PAY_LINK_MIN);
  assert.equal(WMAX, PAY_LINK_MAX);
  for (const check of [payLinkAmountError, websiteAmountError]) {
    assert.match(check(19.99), /smallest amount is AED 20/);
    assert.match(check(5000.01), /largest amount/);
    assert.match(check('abc'), /amount/);
    assert.equal(check(20), null);
    assert.equal(check(5000), null);
  }
});
