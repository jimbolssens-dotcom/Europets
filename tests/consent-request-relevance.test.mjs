import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentRequestStillWanted } from '../lib/consentRequestRelevance.js';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const ctx = {
  hospitalizations: new Map([
    ['in', { discharged_at: null }],
    ['just-out', { discharged_at: '2026-10-30T09:00:00Z' }],
    ['long-out', { discharged_at: '2026-09-28T13:00:00Z' }],
  ]),
  visits: new Map([['today', { started_at: '2026-10-30T06:00:00Z' }], ['old', { started_at: '2026-10-10T04:00:00Z' }]]),
  catteryBookings: new Map([
    ['staying', { status: 'checked_in', date_out: '2026-11-02' }],
    ['gone', { status: 'checked_out', updated_at: '2026-10-20T08:00:00Z', date_out: '2026-10-20' }],
    ['past-date', { status: 'booked', date_out: '2026-10-25' }],
  ]),
};

test('a stay still going, or just ended, keeps its form on the home', () => {
  assert.equal(consentRequestStillWanted({ hospitalization_id: 'in' }, ctx, NOW), true);
  assert.equal(consentRequestStillWanted({ hospitalization_id: 'just-out' }, ctx, NOW), true);
  assert.equal(consentRequestStillWanted({ visit_id: 'today' }, ctx, NOW), true);
  assert.equal(consentRequestStillWanted({ cattery_booking_id: 'staying' }, ctx, NOW), true);
});

test('a stay long over drops its unsigned form', () => {
  assert.equal(consentRequestStillWanted({ hospitalization_id: 'long-out' }, ctx, NOW), false);
  assert.equal(consentRequestStillWanted({ visit_id: 'old' }, ctx, NOW), false);
  assert.equal(consentRequestStillWanted({ cattery_booking_id: 'gone' }, ctx, NOW), false);
  assert.equal(consentRequestStillWanted({ cattery_booking_id: 'past-date' }, ctx, NOW), false);
});

test('unknown stays are kept rather than hidden', () => {
  assert.equal(consentRequestStillWanted({ hospitalization_id: 'missing' }, ctx, NOW), true);
});
