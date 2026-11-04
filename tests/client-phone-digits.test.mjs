import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneDigits, isPlausiblePhoneDigits } from '../lib/clientPhoneDigits.js';

test('UAE numbers keep working however they are typed', () => {
  for (const typed of ['0501234567', '501234567', '+971 501234567', '+971 0501234567', '00971501234567', '+971501234567', '971 50 123 4567']) {
    assert.equal(normalizePhoneDigits(typed), '971501234567', typed);
  }
});

test('a foreign number with its own country code stays foreign', () => {
  assert.equal(normalizePhoneDigits('+357 99 123456'), '35799123456');
  assert.equal(normalizePhoneDigits('00357 99 123456'), '35799123456');
  assert.equal(normalizePhoneDigits('+44 7700 900123'), '447700900123');
});

test('a foreign number typed after the ready-filled +971 (4 Nov, Cyprus owner)', () => {
  assert.equal(normalizePhoneDigits('+971 357 99 123456'), '35799123456');
  assert.equal(normalizePhoneDigits('+971 +357 99 123456'), '35799123456');
  assert.equal(normalizePhoneDigits('+971 00357 99 123456'), '35799123456');
  assert.equal(normalizePhoneDigits('+971 44 7700 900123'), '447700900123');
});

test('reading the result again with a "+" gives the same number (form -> server)', () => {
  for (const typed of ['+971 501234567', '+971 357 99 123456', '+44 7700 900123', '0501234567']) {
    const once = normalizePhoneDigits(typed);
    assert.equal(normalizePhoneDigits(`+${once}`), once, typed);
  }
});

test('too short to be a number', () => {
  assert.equal(isPlausiblePhoneDigits(normalizePhoneDigits('+971 ')), false);
  assert.equal(isPlausiblePhoneDigits(normalizePhoneDigits('+971 5012')), false);
  assert.equal(isPlausiblePhoneDigits(normalizePhoneDigits('+971 501234567')), true);
  assert.equal(isPlausiblePhoneDigits(normalizePhoneDigits('+357 99 123456')), true);
});
