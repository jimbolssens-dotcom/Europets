import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thankYouBalanceLine, MANY_OPEN_INVOICES } from '../lib/thankYouBalance.js';

test('a client with dozens of open invoices gets the link, not a six-figure total', () => {
  const line = thankYouBalanceLine({ openCount: 63, remainingLabel: '100000.00', invoicesText: '63 open invoices', payUrl: 'https://epc.vet/settle-bill/owner/x' });
  assert.equal(line, 'You can see everything still open, and settle any of it, here: https://epc.vet/settle-bill/owner/x');
  assert.ok(!/AED/.test(line));
});

test('a few open invoices still show the balance; none says settled', () => {
  assert.equal(
    thankYouBalanceLine({ openCount: 1, remainingLabel: '21.79', invoicesText: 'invoice INV-0', payUrl: 'u' }),
    'A balance of AED 21.79 is still open for invoice INV-0. You can settle it securely here: u'
  );
  assert.match(thankYouBalanceLine({ openCount: MANY_OPEN_INVOICES, remainingLabel: '1.00', invoicesText: 'x', payUrl: 'u' }), /^A balance of AED/);
  assert.equal(thankYouBalanceLine({ openCount: 0 }), 'Your account is now fully settled.');
});
