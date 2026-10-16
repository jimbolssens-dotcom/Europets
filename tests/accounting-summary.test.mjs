import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthlyFigures,
  isFixedCost,
  invoiceMethodGroup,
  legacyMethodGroup,
  invoicePaymentVat,
  legacyPaymentVat,
} from '../lib/accountingSummary.js';

test('old-system payments are takings and carry 5% VAT inclusive', () => {
  const f = buildMonthlyFigures({ legacyPayments: [{ amount: 1050, payment_method: 'Nomod' }] });
  assert.equal(f.takings.total, 1050);
  assert.equal(f.takings.old_system, 1050);
  assert.equal(f.takings.by_method.online, 1050);
  assert.equal(f.vat.collected_old_system, 50);
  assert.equal(f.vat.collected, 50);
  assert.equal(f.vat.takings, 1000);
});

test("a new invoice payment carries its share of that invoice's own VAT", () => {
  // AED 1,000 consult (VAT 50) + AED 200 VAT-free item: total 1,250, VAT 50.
  const invoice = { total: 1250, vat_amount: 50 };
  assert.equal(invoicePaymentVat(625, invoice), 25); // half paid -> half the VAT
  const f = buildMonthlyFigures({ payments: [{ amount: 1250, payment_method: 'card', invoices: invoice }] });
  assert.equal(f.vat.collected, 50); // not 1250 * 5/105 = 59.52
  assert.equal(f.takings.by_method.card, 1250);
});

test('an invoice with no total carries no VAT', () => {
  assert.equal(invoicePaymentVat(100, { total: 0, vat_amount: 0 }), 0);
});

test('payment methods group into the spreadsheet columns', () => {
  assert.equal(invoiceMethodGroup('payment_link'), 'online');
  assert.equal(invoiceMethodGroup('nomod'), 'online');
  assert.equal(invoiceMethodGroup('bank_transfer'), 'bank_transfer');
  assert.equal(legacyMethodGroup('Bank Transfer'), 'bank_transfer');
  assert.equal(legacyMethodGroup('Card'), 'card');
  assert.equal(legacyMethodGroup(null), 'other');
});

test('fixed costs follow the category unless an expense says otherwise', () => {
  assert.equal(isFixedCost({ category: 'salaries' }), true);
  assert.equal(isFixedCost({ category: 'supplies' }), false);
  assert.equal(isFixedCost({ category: 'other', fixed_cost: true }), true); // the sponsor fee
  assert.equal(isFixedCost({ category: 'rent', fixed_cost: false }), false);
});

test('gross and net profit, the spreadsheet way', () => {
  const f = buildMonthlyFigures({
    payments: [{ amount: 10500, payment_method: 'cash', invoices: { total: 10500, vat_amount: 500 } }],
    legacyPayments: [{ amount: 2100, payment_method: 'Card' }],
    expenses: [
      { category: 'supplies', amount: 2000, vat_amount: 100, total: 2100 },
      { category: 'salaries', amount: 5000, vat_amount: 0, total: 5000 },
      { category: 'other', amount: 1000, vat_amount: 0, total: 1000, fixed_cost: true },
    ],
  });
  assert.equal(f.takings.total, 12600);
  assert.equal(f.outgoing.total, 2100);
  assert.equal(f.outgoing.ex_vat, 2000);
  assert.equal(f.gross_profit.total, 10500);
  assert.equal(f.fixed_costs.total, 6000);
  assert.equal(f.net_profit.total, 4500);
  assert.equal(f.vat.collected, 600); // 500 + 2100 * 5/105
  assert.equal(f.vat.paid, 100);
  assert.equal(f.vat.net_due, 500);
  assert.equal(f.vat.takings, 12000);
});

test('legacyPaymentVat is 5/105', () => {
  assert.equal(Math.round(legacyPaymentVat(210) * 100) / 100, 10);
});
