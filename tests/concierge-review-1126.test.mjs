// Concierge review 26 Nov: real threads, anonymised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaymentScreenshot, PAYMENT_SCREENSHOT_WINDOW_MS } from '../lib/paymentScreenshot.js';

const at = (s) => new Date(`2026-11-25T${s}Z`).toISOString();

// Invoice and pay link sent, paid online 06:23:58, photo 06:24:23: the
// concierge said it had passed the photo to the team, and the payment
// thank-you followed at 06:25:32.
const thread = [
  { sender: 'staff', body: 'Here is your invoice from Europets Clinic: https://portal.epc.vet/api/invoices/x/tax-invoice-pdf', created_at: at('05:43:26') },
  { sender: 'system', body: 'Here is your secure link to settle your balance: https://epc.vet/settle-bill/x', created_at: at('05:43:29') },
  { sender: 'client', body: '', media_type: 'image', created_at: at('06:24:23') },
];

test('a lone photo seconds after paying online gets no notice: the thank-you confirms the payment', () => {
  assert.equal(isPaymentScreenshot(thread, at('06:23:58'), Date.parse(at('06:24:25'))), true);
  // Two screenshots at once, the same.
  assert.equal(isPaymentScreenshot([...thread, { sender: 'client', body: '', media_type: 'image', created_at: at('06:24:24') }], at('06:23:58'), Date.parse(at('06:24:26'))), true);
});

test('a photo with words, a photo long after paying, or no online payment still gets an answer', () => {
  const now = Date.parse(at('06:24:25'));
  assert.equal(isPaymentScreenshot([...thread.slice(0, 2), { sender: 'client', body: 'Is this the right amount?', media_type: 'image', created_at: at('06:24:23') }], at('06:23:58'), now), false);
  assert.equal(isPaymentScreenshot([...thread, { sender: 'client', body: 'Done', created_at: at('06:24:24') }], at('06:23:58'), now), false);
  assert.equal(isPaymentScreenshot(thread, null, now), false);
  assert.equal(isPaymentScreenshot(thread, new Date(now - PAYMENT_SCREENSHOT_WINDOW_MS - 1000).toISOString(), now), false);
  // A wound photo from a client who paid yesterday.
  assert.equal(isPaymentScreenshot(thread, at('06:23:58'), now + 86400000), false);
});

// "Hi" at 10:24:30, the booking question at 10:24:51: the reply to the
// greeting went out at 10:24:50 and crossed it.
import { debounceFor } from '../lib/conciergeDebounce.js';
test('"Hi" waits long enough for a question typed 21 seconds later', () => {
  assert.ok(debounceFor('Hi') >= 25000);
  assert.ok(debounceFor('Hi') <= 60000);
});
