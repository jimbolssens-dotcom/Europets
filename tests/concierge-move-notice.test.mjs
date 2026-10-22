import test from 'node:test';
import assert from 'node:assert/strict';
import { movableNote, whyNotMovable } from '../lib/conciergeSituation.js';

// 674db525, 21 Oct: a consult at 17:30 that day was on file; at 15:51 the
// client asked to push it to the next morning. Five new times were offered,
// the client picked 9:30, and only then was it refused (within 24 hours).
const consult = (startsUae, extra = {}) => ({ type: 'consult', status: 'booked', duration_minutes: 15, start_time: `${startsUae}+04:00`, ...extra });
const at = (uae) => Date.parse(`${uae}+04:00`);

test("a consult within 24 hours says up front that it can't be moved by the concierge", () => {
  const note = movableNote(consult('2026-10-21T17:30:00'), at('2026-10-21T15:51:00'));
  assert.match(note, /can't move this one yourself \(it is within the next 24 hours\)/);
  assert.match(note, /don't offer any new times/);
  assert.match(note, /hand it to staff/);
});

test('a consult two days away is movable, so nothing is added', () => {
  assert.equal(movableNote(consult('2026-10-23T10:45:00'), at('2026-10-21T15:51:00')), '');
  assert.equal(whyNotMovable(consult('2026-10-23T10:45:00'), at('2026-10-21T15:51:00')), null);
});

test('surgeries, checked-in and long consults are never movable', () => {
  const now = at('2026-10-21T15:51:00');
  assert.match(movableNote(consult('2026-10-25T09:00:00', { type: 'surgery' }), now), /surgery or procedure/);
  assert.match(movableNote(consult('2026-10-25T09:00:00', { status: 'checked_in' }), now), /checked in/);
  assert.match(movableNote(consult('2026-10-25T09:00:00', { duration_minutes: 30 }), now), /longer, specially booked/);
});
