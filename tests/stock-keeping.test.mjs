import test from 'node:test';
import assert from 'node:assert/strict';
import { isLow, lowItemsToAlert, itemsRestocked, lowStockMessage, countChange } from '../lib/stockKeeping.js';

const now = Date.parse('2026-10-27T09:00:00+04:00');
const lvl = (name, on_hand, reorder_level, extra = {}) => ({ name, on_hand, reorder_level, started: true, active: true, low_alert_sent_at: null, ...extra });

test('low means at or below the reorder level, once it has been counted', () => {
  assert.ok(isLow(lvl('FIV/FeLV Test', 5, 5)));
  assert.ok(!isLow(lvl('FIV/FeLV Test', 6, 5)));
  assert.ok(!isLow(lvl('FIV/FeLV Test', -3, 5, { started: false })), 'never counted: no alert');
  assert.ok(!isLow(lvl('FIV/FeLV Test', 0, 5, { active: false })));
});

test('one alert per drop, repeated weekly while it stays low', () => {
  const fresh = lvl('Biofel PCH-R', 3, 10);
  const yesterday = lvl('Biocan R', 2, 5, { low_alert_sent_at: new Date(now - 86400000).toISOString() });
  const lastWeek = lvl('FIP Test', 1, 2, { low_alert_sent_at: new Date(now - 8 * 86400000).toISOString() });
  assert.deepEqual(lowItemsToAlert([fresh, yesterday, lastWeek], now).map((l) => l.name), ['Biofel PCH-R', 'FIP Test']);
});

test('restocked items clear their alert', () => {
  const back = lvl('Biocan R', 20, 5, { low_alert_sent_at: new Date(now - 86400000).toISOString() });
  assert.deepEqual(itemsRestocked([back, lvl('FIP Test', 1, 2)]).map((l) => l.name), ['Biocan R']);
});

test('the alert lists the lowest first', () => {
  const msg = lowStockMessage([lvl('Biocan R', 4, 5), lvl('FIV/FeLV Test', 0, 5)]);
  assert.match(msg, /FIV\/FeLV Test: none left \(reorder at 5\)\n• Biocan R: 4 left/);
});

test('a count records the difference from what was expected', () => {
  assert.equal(countChange(-6, 14), 20);
  assert.equal(countChange(12, 9), -3);
});
