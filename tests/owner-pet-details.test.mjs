import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanMicrochip, microchipError, birthDateError, ownerPetUpdate } from '../lib/ownerPetDetails.js';

test('microchip numbers are cleaned and checked', () => {
  assert.equal(cleanMicrochip(' 784 0981-0012.3456 '), '784098100123456');
  assert.equal(microchipError('784 098 100 123 456'), null);
  assert.equal(microchipError(''), null);
  assert.ok(microchipError('12345'));
  assert.ok(microchipError('7840981001234567890'));
  assert.ok(microchipError('7840981#0123456'));
});

test('birth dates must be real and not in the future', () => {
  assert.equal(birthDateError('2021-03-02', '2026-11-10'), null);
  assert.ok(birthDateError('2027-01-01', '2026-11-10'));
  assert.ok(birthDateError('1970-01-01', '2026-11-10'));
  assert.ok(birthDateError('02/03/2021', '2026-11-10'));
});

test("an owner's birth date clears the estimated flag", () => {
  assert.deepEqual(ownerPetUpdate({ date_of_birth: '2021-03-02' }).update, { date_of_birth: '2021-03-02', date_of_birth_estimated: false });
  assert.deepEqual(ownerPetUpdate({ microchip_number: '' }).update, { microchip_number: null });
  assert.ok(ownerPetUpdate({ microchip_number: 'abc' }).error);
});
