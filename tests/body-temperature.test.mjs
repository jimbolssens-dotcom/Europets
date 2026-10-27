import test from 'node:test';
import assert from 'node:assert/strict';
import { temperatureError, dictatedTemperature } from '../lib/bodyTemperature.js';

test('a typed temperature must be between 32 and 42', () => {
  for (const ok of [32, 38.5, '39.1', 42, null, '']) assert.equal(temperatureError(ok), null);
  for (const bad of [31.9, 42.1, 389, 0, '3.9', 'abc']) assert.match(temperatureError(bad), /between 32 and 42/);
});

test('a dictated temperature gets its decimal point back, or is dropped', () => {
  assert.equal(dictatedTemperature(38.7), 38.7);
  assert.equal(dictatedTemperature(389), 38.9);
  assert.equal(dictatedTemperature(3.9), null);
  assert.equal(dictatedTemperature(67.9), null);
  assert.equal(dictatedTemperature(null), null);
});
