import test from 'node:test';
import assert from 'node:assert/strict';
import { movableNote, whyNotMovable, whyNotMovableTo, onlyToAnotherDay } from '../lib/conciergeSituation.js';

const consult = (startsUae, extra = {}) => ({ type: 'consult', status: 'booked', duration_minutes: 15, start_time: `${startsUae}+04:00`, ...extra });
const at = (uae) => Date.parse(`${uae}+04:00`);
const iso = (uae) => new Date(at(uae)).toISOString();

// 1308a9aa, 22 Oct 07:41: "I would like to change my scheduled appointment
// to tomorrow" for a consult at 9:45 that day. And 674db525, 21 Oct 15:51:
// a 17:30 consult pushed to 9:30 the next morning. Both went to the team
// under the old 24-hour rule; the AI can now move them itself.
test('a consult today can be moved to tomorrow by the concierge', () => {
  const now = at('2026-10-22T07:41:00');
  const today = consult('2026-10-22T09:45:00');
  assert.equal(whyNotMovable(today, now), null);
  assert.equal(whyNotMovableTo(today, iso('2026-10-23T10:00:00'), now), null);
  assert.equal(whyNotMovableTo(consult('2026-10-21T17:30:00'), iso('2026-10-22T09:30:00'), at('2026-10-21T15:51:00')), null);
});

test('a move to another time today stays with the team', () => {
  const now = at('2026-10-22T07:41:00');
  assert.match(whyNotMovableTo(consult('2026-10-22T09:45:00'), iso('2026-10-22T17:00:00'), now), /same-day changes are arranged by the team/);
  // Even for a booking days away: moving it into today is the team's.
  assert.match(whyNotMovableTo(consult('2026-10-25T10:00:00'), iso('2026-10-22T16:00:00'), now), /the new time is today/);
  assert.equal(whyNotMovableTo(consult('2026-10-25T10:00:00'), iso('2026-10-24T16:00:00'), now), null);
});

test('what the AI is shown says a consult today can only go to another day', () => {
  const now = at('2026-10-22T07:41:00');
  const today = consult('2026-10-22T09:45:00');
  assert.ok(onlyToAnotherDay(today, now));
  assert.match(movableNote(today, now), /move it to another day yourself \(offer times from tomorrow on\)/);
  // Tomorrow morning: within 24 hours, but not today, so any later day is fine.
  assert.equal(movableNote(consult('2026-10-23T09:30:00'), at('2026-10-22T15:00:00')), '');
});

test('surgeries, checked-in, past and long consults are never movable', () => {
  const now = at('2026-10-21T15:51:00');
  assert.match(movableNote(consult('2026-10-25T09:00:00', { type: 'surgery' }), now), /surgery or procedure/);
  assert.match(movableNote(consult('2026-10-25T09:00:00', { status: 'checked_in' }), now), /checked in/);
  assert.match(movableNote(consult('2026-10-25T09:00:00', { duration_minutes: 30 }), now), /longer, specially booked/);
  assert.match(movableNote(consult('2026-10-21T15:00:00'), now), /already passed/);
  assert.match(movableNote(consult('2026-10-25T09:00:00', { type: 'surgery' }), now), /don't offer any new times/);
});
