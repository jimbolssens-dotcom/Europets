import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceSearch, dateTermBounds } from '../lib/invoiceSearch.js';

// Fri 30 Oct 2026, 12:00 UAE.
const now = Date.parse('2026-10-30T08:00:00Z');
const p = (q) => parseInvoiceSearch(q, now);

test('invoice numbers', () => {
  assert.deepEqual(p('INV-000916'), [{ kind: 'invoice', n: 916 }]);
  assert.deepEqual(p('inv916'), [{ kind: 'invoice', n: 916 }]);
  assert.deepEqual(p('#916'), [{ kind: 'invoice', n: 916 }]);
});

test('a bare number could be an invoice, client or patient number', () => {
  assert.deepEqual(p('15343'), [{ kind: 'number', n: 15343 }]);
});

test('amounts and phone numbers', () => {
  assert.deepEqual(p('619.50'), [{ kind: 'amount', value: 619.5 }]);
  assert.deepEqual(p('aed 619'), [{ kind: 'amount', value: 619 }]);
  assert.deepEqual(p('0505695203'), [{ kind: 'phone', digits: '0505695203' }]);
  assert.deepEqual(p('+971 50 569 5203'), [{ kind: 'phone', digits: '971505695203' }]);
});

test('dates, day first, the latest one when no year is given', () => {
  assert.deepEqual(p('28/10').map((t) => [t.from, t.to]), [['2026-10-28', '2026-10-28']]);
  assert.deepEqual(p('28/10/2025').map((t) => [t.from, t.to]), [['2025-10-28', '2025-10-28']]);
  assert.deepEqual(p('2026-10-28').map((t) => [t.from, t.to]), [['2026-10-28', '2026-10-28']]);
  assert.deepEqual(p('28 oct').map((t) => [t.from, t.to]), [['2026-10-28', '2026-10-28']]);
  assert.deepEqual(p('Oct 2026').map((t) => [t.from, t.to]), [['2026-10-01', '2026-10-31']]);
  // December hasn't come yet this year: last December.
  assert.deepEqual(p('december').map((t) => [t.from, t.to]), [['2025-12-01', '2025-12-31']]);
  assert.deepEqual(dateTermBounds({ from: '2026-10-28', to: '2026-10-28' }), { from: '2026-10-27T20:00:00.000Z', to: '2026-10-28T20:00:00.000Z' });
});

test('several words narrow it down', () => {
  assert.deepEqual(p('Felix PCR oct'), [
    { kind: 'date', from: '2026-10-01', to: '2026-10-31', label: 'oct' },
    { kind: 'text', text: 'felix' },
    { kind: 'text', text: 'pcr' },
  ]);
  assert.deepEqual(p('unpaid Maria'), [{ kind: 'status', statuses: ['unpaid'] }, { kind: 'text', text: 'maria' }]);
});

test('each search field matches only its own thing', async () => {
  const { fieldSearchTerms } = await import('../lib/invoiceSearch.js');
  const now = Date.parse('2026-10-30T08:00:00Z');
  assert.deepEqual(fieldSearchTerms({ invoice_no: 'INV-000916' }, now), [{ kind: 'invoice', n: 916 }]);
  assert.deepEqual(fieldSearchTerms({ invoice_no: '#916' }, now), [{ kind: 'invoice', n: 916 }]);
  assert.deepEqual(fieldSearchTerms({ client_no: '15343' }, now), [{ kind: 'client', n: 15343 }]);
  assert.deepEqual(fieldSearchTerms({ patient_no: '30330' }, now), [{ kind: 'patient', n: 30330 }]);
  assert.deepEqual(fieldSearchTerms({ name: 'felix' }, now), [{ kind: 'name', text: 'felix' }]);
  assert.deepEqual(fieldSearchTerms({ phone: '+971 50 123 4567' }, now), [{ kind: 'phone', digits: '971501234567' }]);
  assert.deepEqual(fieldSearchTerms({ item: 'PCR' }, now), [{ kind: 'item', text: 'PCR' }]);
  assert.deepEqual(fieldSearchTerms({ amount: 'AED 619,50' }, now), [{ kind: 'amount', value: 619.5 }]);
  assert.deepEqual(fieldSearchTerms({ amount: '450' }, now), [{ kind: 'amount', value: 450 }]);
  const [date] = fieldSearchTerms({ date: '28/10' }, now);
  assert.deepEqual([date.kind, date.from, date.to], ['date', '2026-10-28', '2026-10-28']);
  const [month] = fieldSearchTerms({ date: 'Oct 2025' }, now);
  assert.deepEqual([month.from, month.to], ['2025-10-01', '2025-10-31']);
});

test('fields combine, blanks are skipped, nonsense finds nothing', async () => {
  const { fieldSearchTerms } = await import('../lib/invoiceSearch.js');
  const now = Date.parse('2026-10-30T08:00:00Z');
  assert.deepEqual(fieldSearchTerms({ client_no: '15343', item: 'pcr', name: '  ' }, now), [{ kind: 'client', n: 15343 }, { kind: 'item', text: 'pcr' }]);
  assert.deepEqual(fieldSearchTerms({ invoice_no: 'abc' }, now), [{ kind: 'none' }]);
  assert.deepEqual(fieldSearchTerms({ date: '31/02' }, now), [{ kind: 'none' }]);
  assert.deepEqual(fieldSearchTerms({ phone: '12' }, now), [{ kind: 'none' }]);
  assert.deepEqual(fieldSearchTerms({}, now), []);
});
