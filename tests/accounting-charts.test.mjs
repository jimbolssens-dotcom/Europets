import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketKey, bucketsUpTo, buildChartData, LAST_IMPORTED_CLIENT_NUMBER, lineItemCategory } from '../lib/accountingCharts.js';

test('weeks start Monday in UAE time, months on the 1st', () => {
  // Sunday 18 Oct 2026, 22:30 UAE = 18:30 UTC: still the week of Mon 12 Oct.
  assert.equal(bucketKey('2026-10-18T18:30:00Z', 'week'), '2026-10-12');
  // Sunday 18 Oct, 20:30 UTC = Monday 19 Oct 00:30 UAE: the next week.
  assert.equal(bucketKey('2026-10-18T20:30:00Z', 'week'), '2026-10-19');
  assert.equal(bucketKey('2026-09-30T21:00:00Z', 'month'), '2026-10-01');
  assert.equal(bucketKey('2026-10-05', 'week'), '2026-10-05');
});

test('the last N buckets end with the current one', () => {
  assert.deepEqual(bucketsUpTo('2026-10-19T08:00:00Z', 'week', 3), ['2026-10-05', '2026-10-12', '2026-10-19']);
  assert.deepEqual(bucketsUpTo('2026-02-10T08:00:00Z', 'month', 3), ['2025-12-01', '2026-01-01', '2026-02-01']);
});

test('takings, invoicing, discounts, new clients and what is owed', () => {
  const buckets = ['2026-10-05', '2026-10-12'];
  const d = buildChartData({
    unit: 'week',
    buckets,
    now: Date.parse('2026-10-19T08:00:00Z'),
    payments: [
      { amount: 100, payment_method: 'card', paid_at: '2026-10-06T08:00:00Z' },
      { amount: 50, payment_method: 'payment_link', paid_at: '2026-10-13T08:00:00Z' },
      { amount: 999, payment_method: 'cash', paid_at: '2026-09-01T08:00:00Z' }, // outside the range
    ],
    legacyPayments: [{ amount: 30, payment_method: 'Cash', paid_at: '2026-10-14T08:00:00Z' }],
    invoices: [
      { total: 200, discount_amount: 20, created_at: '2026-10-06T08:00:00Z', vet_name: 'Dr. A' },
      { total: 100, discount_amount: 0, created_at: '2026-10-07T08:00:00Z', vet_name: null },
    ],
    clients: [
      { client_number: LAST_IMPORTED_CLIENT_NUMBER, created_at: '2026-10-06T08:00:00Z' }, // imported
      { client_number: LAST_IMPORTED_CLIENT_NUMBER + 5, created_at: '2026-10-13T08:00:00Z' },
    ],
    unpaid: [
      { total: 100, amount_paid: 40, created_at: '2026-10-15T08:00:00Z' },
      { total: 50, amount_paid: 0, created_at: '2026-07-01T08:00:00Z' },
      { total: 80, amount_paid: 80, created_at: '2026-10-15T08:00:00Z' }, // nothing left owing
    ],
  });
  assert.equal(d.takings.card['2026-10-05'], 100);
  assert.equal(d.takings.online['2026-10-12'], 50);
  assert.equal(d.takings.old_system['2026-10-12'], 30);
  assert.equal(d.collected['2026-10-12'], 50);
  assert.equal(d.invoiced['2026-10-05'], 300);
  assert.equal(d.averageInvoice['2026-10-05'], 150);
  assert.equal(d.discounts['2026-10-05'], 20);
  assert.equal(d.discountCount['2026-10-05'], 1);
  assert.equal(d.newClients['2026-10-05'], 0);
  assert.equal(d.newClients['2026-10-12'], 1);
  assert.deepEqual(d.byVet.map((v) => v.label), ['Dr. A', 'No vet']);
  assert.equal(d.owed[0].value, 60);
  assert.equal(d.owed.at(-1).label, 'Over 90 days');
  assert.equal(d.owed.at(-1).value, 50);
});

test('food gets its own bar, apart from other products', () => {
  assert.equal(lineItemCategory({ main_category: 'product', catalog_subcategories: { name: 'Food ' } }), 'food');
  assert.equal(lineItemCategory({ main_category: 'product', catalog_subcategories: { name: 'Medication' } }), 'product');
  assert.equal(lineItemCategory({ main_category: 'service', catalog_subcategories: null }), 'service');
  assert.equal(lineItemCategory(null), 'other');
});

test('food invoicing per period', () => {
  const d = buildChartData({
    unit: 'week',
    buckets: ['2026-10-05', '2026-10-12'],
    lineItems: [
      { line_total: 80, category: 'food', created_at: '2026-10-06T08:00:00Z' },
      { line_total: 20, category: 'food', created_at: '2026-10-13T08:00:00Z' },
      { line_total: 500, category: 'product', created_at: '2026-10-13T08:00:00Z' },
    ],
  });
  assert.deepEqual(d.food, { '2026-10-05': 80, '2026-10-12': 20 });
});

import { appLoginStats } from '../lib/accountingCharts.js';

test('client app: each number once, in the week of its first code, staff left out', () => {
  const buckets = ['2026-10-12', '2026-10-19'];
  const codes = [
    { phone: '971500000001', created_at: '2026-10-13T08:00:00Z', consumed_at: '2026-10-13T08:01:00Z', attempts: 0 },
    { phone: '971500000001', created_at: '2026-10-20T08:00:00Z', consumed_at: null, attempts: 0 },
    { phone: '971500000002', created_at: '2026-10-21T08:00:00Z', consumed_at: '2026-10-21T08:10:00Z', attempts: 5 },
    { phone: '971500000003', created_at: '2026-10-22T08:00:00Z', consumed_at: null, attempts: 1 },
    { phone: '971566051330', created_at: '2026-10-22T08:00:00Z', consumed_at: '2026-10-22T08:01:00Z', attempts: 0 },
  ];
  const s = appLoginStats({ codes, unit: 'week', buckets, staffPhones: ['971566051330'] });
  assert.deepEqual(s.asked, { '2026-10-12': 1, '2026-10-19': 2 });
  assert.deepEqual(s.loggedIn, { '2026-10-12': 1, '2026-10-19': 0 });
  assert.deepEqual(s.totals, { asked: 3, loggedIn: 1 });
});

test('discounts count on the day they were given, VAT included, not by the invoice date', () => {
  const d = buildChartData({
    unit: 'week',
    buckets: ['2026-09-14', '2026-10-19', '2026-10-26'],
    invoices: [{ total: 500, discount_amount: 95.24, created_at: '2026-09-14T08:00:00Z' }],
    discountsGiven: [
      { amount: 47.62, invoice_id: 'i71', created_at: '2026-10-25T17:25:00Z' },
      { amount: 47.62, invoice_id: 'i71', created_at: '2026-10-25T18:55:00Z' },
      { amount: 142.86, invoice_id: 'i75', created_at: '2026-10-26T14:15:00Z' },
    ],
  });
  assert.equal(d.discounts['2026-09-14'], 0);
  assert.equal(Math.round(d.discounts['2026-10-19'] * 100) / 100, 100);
  assert.equal(d.discountCount['2026-10-19'], 1);
  assert.equal(d.discounts['2026-10-26'], 150);
});

test('before the app, takings and outgoing come from the old float, without counting September twice', () => {
  const oldFloat = {
    days: [
      { day: '2026-08-10', shift: 1, cash: 10, card: 100, online: 20, outgoing: 50 },
      { day: '2026-09-20', shift: 1, cash: 5, card: 200, online: 0, outgoing: 0 },
      { day: '2026-09-01', shift: 0, cash: 0, card: 0, online: 0, outgoing: 7 }, // a cost-only row
    ],
    months: [
      { month: '2026-08-01', outgoing: 50, fixed_costs: 80, one_off_costs: null, costs_complete: true },
      { month: '2026-09-01', outgoing: 7, fixed_costs: 0, costs_complete: false },
    ],
  };
  const d = buildChartData({
    unit: 'month',
    buckets: ['2026-08-01', '2026-09-01', '2026-10-01'],
    payments: [
      { amount: 999, payment_method: 'card', paid_at: '2026-09-20T08:00:00Z' }, // in the float already
      { amount: 40, payment_method: 'cash', paid_at: '2026-10-02T08:00:00Z' },
    ],
    legacyPayments: [{ amount: 888, payment_method: 'Cash', paid_at: '2026-09-21T08:00:00Z' }],
    expenses: [
      { total: 9, category: 'supplies', expense_date: '2026-08-12' }, // the float has August's costs
      { total: 250, category: 'salaries', expense_date: '2026-09-25' },
      { total: 60, category: 'rent', expense_date: '2026-10-01' },
    ],
    oldFloat,
  });
  assert.deepEqual(d.takingsTotal, { '2026-08-01': 130, '2026-09-01': 205, '2026-10-01': 40 });
  assert.equal(d.takings.card['2026-09-01'], 200);
  assert.equal(d.collected['2026-09-01'], 999); // new invoices only, as before
  assert.deepEqual(d.outgoing, { '2026-08-01': 130, '2026-09-01': 250, '2026-10-01': 60 });
  assert.deepEqual(d.oldFloatBuckets, ['2026-08-01', '2026-09-01']);
});

test('without the old float, nothing changes', () => {
  const d = buildChartData({
    unit: 'week',
    buckets: ['2026-09-14'],
    payments: [{ amount: 70, payment_method: 'card', paid_at: '2026-09-15T08:00:00Z' }],
    expenses: [{ total: 12, category: 'supplies', expense_date: '2026-09-15' }],
  });
  assert.equal(d.takingsTotal['2026-09-14'], 70);
  assert.equal(d.outgoing['2026-09-14'], 12);
  assert.deepEqual(d.oldFloatBuckets, []);
});
