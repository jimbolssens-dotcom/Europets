import test from 'node:test';
import assert from 'node:assert/strict';
import { groomingDurationError, GROOMING_DEFAULT_DURATION_MINUTES } from '../lib/appointmentScheduling.js';
import { colorForAppointment, GROOMING_COLOR } from '../lib/staffColors.js';

test('grooming is booked in whole 15 minutes, an hour by default', () => {
  assert.equal(GROOMING_DEFAULT_DURATION_MINUTES, 60);
  for (const m of [15, 30, 60, 90, 240, 480]) assert.equal(groomingDurationError(m), null);
  for (const m of [0, 10, 50, 495, 1.5]) assert.match(groomingDurationError(m), /multiple of 15/);
});

test('grooming has its own colour, whoever the vet field says', () => {
  assert.deepEqual(colorForAppointment({ v1: { bg: '#fff', fg: '#000' } }, 'v1', 'grooming'), GROOMING_COLOR);
});
