import test from 'node:test';
import assert from 'node:assert/strict';
import { splitByInCare } from '../lib/reminderInCare.js';

// 28 Oct: a dog admitted at 15:38 had surgery booked for the next morning,
// and the 17:30 reminder still told the owner to bring him in.
test('no reminder for a pet admitted with us', () => {
  const appointments = [
    { id: 'surgery-tomorrow', patient_id: 'admitted-dog', type: 'surgery' },
    { id: 'consult-tomorrow', patient_id: 'at-home-cat', type: 'consult' },
  ];
  const { send, skipped } = splitByInCare(appointments, ['admitted-dog']);
  assert.deepEqual(send.map((a) => a.id), ['consult-tomorrow']);
  assert.deepEqual(skipped.map((a) => a.id), ['surgery-tomorrow']);
});

test('nobody in care: everyone is reminded', () => {
  assert.equal(splitByInCare([{ patient_id: 'a' }, { patient_id: 'b' }], []).send.length, 2);
});
