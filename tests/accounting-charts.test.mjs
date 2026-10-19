import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketKey, bucketsUpTo, buildChartData, LAST_IMPORTED_CLIENT_NUMBER } from '../lib/accountingCharts.js';

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
