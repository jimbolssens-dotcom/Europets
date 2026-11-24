import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientNewPet } from '../lib/clientNewPet.js';

test('a new pet from the client app', () => {
  const { data } = clientNewPet({ name: '  Mochi ', species: 'Cat', sex: 'female', breed: 'Persian', microchip_number: '784 0981 0012 3456', date_of_birth: '2025-06-01' }, '2026-11-24');
  assert.deepEqual(data, { name: 'Mochi', species: 'cat', sex: 'female', breed: 'Persian', color: null, date_of_birth: '2025-06-01', microchip_number: '784098100123456' });
});
test('what it refuses', () => {
  assert.match(clientNewPet({ species: 'cat', sex: 'female' }).error, /name/);
  assert.match(clientNewPet({ name: 'A', sex: 'female' }).error, /species/);
  assert.match(clientNewPet({ name: 'A', species: 'dog' }).error, /sex/);
  assert.match(clientNewPet({ name: 'A', species: 'dog', sex: 'male', microchip_number: '12' }).error, /microchip/i);
  assert.match(clientNewPet({ name: 'A', species: 'dog', sex: 'male', date_of_birth: '2030-01-01' }, '2026-11-24').error, /future/);
});
