import test from 'node:test';
import assert from 'node:assert/strict';
import { itemsNotYetLogged } from '../lib/dictatedItems.js';

test('an item already on the consult is not logged again from the dictation', () => {
  const heard = [{ goods_service_id: 'snap4dx' }, { goods_service_id: 'cbc' }];
  assert.deepEqual(itemsNotYetLogged(heard, ['snap4dx']), [{ goods_service_id: 'cbc' }]);
});

test('the same item heard twice in one dictation is logged once', () => {
  const heard = [{ goods_service_id: 'convenia', n: 1 }, { goods_service_id: 'convenia', n: 2 }];
  assert.deepEqual(itemsNotYetLogged(heard, []), [{ goods_service_id: 'convenia', n: 1 }]);
});

test('nothing logged yet: everything heard goes on', () => {
  assert.equal(itemsNotYetLogged([{ goods_service_id: 'a' }, { goods_service_id: 'b' }], [null]).length, 2);
});
