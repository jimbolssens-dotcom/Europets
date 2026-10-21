import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOnlinePaymentNumber } from '../lib/paymentNumberRules.js';

test('a typed payment number is read as YY-MM-NN', () => {
  assert.deepEqual(parseOnlinePaymentNumber('26-10-30'), { number: '26-10-30', prefix: '26-10', seq: 30 });
  assert.deepEqual(parseOnlinePaymentNumber(' 26-10-5 '), { number: '26-10-05', prefix: '26-10', seq: 5 });
  assert.equal(parseOnlinePaymentNumber('26-10-120').number, '26-10-120');
  assert.equal(parseOnlinePaymentNumber('26 10 30').number, '26-10-30');
});

test('anything else is refused', () => {
  for (const bad of ['', '30', '26-13-01', '26-10-00', 'OS-26-10-01', '2026-10-30', 'abc']) {
    assert.equal(parseOnlinePaymentNumber(bad), null, bad);
  }
});
