import test from 'node:test';
import assert from 'node:assert/strict';
import { surgeryBlocksByVet, buildSurgeryBookingWindow } from '../lib/appointmentBooking.js';

// UAE time on Monday 19 October 2026.
const at = (hhmm) => new Date(Date.parse(`2026-10-19T${hhmm}:00+04:00`)).toISOString();
const window = buildSurgeryBookingWindow({ booking_surgery_start: '10:30:00', booking_surgery_end: '13:00:00' });

// The real Monday: Dr Jim's consults until 10:30, two dentals at 11:00, his
// FHO at 11:30 booked for 20 minutes. 12:45 was offered to a client.
const monday = [
  { vet_id: 'jim', type: 'consult', start_time: at('10:15'), duration_minutes: 15 },
  { vet_id: 'nada', type: 'surgery', start_time: at('11:00'), duration_minutes: 30 },
  { vet_id: 'eva', type: 'surgery', start_time: at('11:00'), duration_minutes: 30 },
  { vet_id: 'jim', type: 'surgery', start_time: at('11:30'), duration_minutes: 20 },
  { vet_id: 'dalma', type: 'consult', start_time: at('17:00'), duration_minutes: 15 },
];

test('a doctor with surgery is in theatre from the start of the list until the window closes', () => {
  const blocks = surgeryBlocksByVet(monday, '2026-10-19', window);
  const jim = blocks.get('jim');
  assert.equal(jim.start.toISOString(), at('11:00'));
  assert.equal(jim.end.toISOString(), at('13:00'));
  const covers = (b, hhmm) => b.start <= new Date(at(hhmm)) && new Date(at(hhmm)) < b.end;
  assert.equal(covers(jim, '12:45'), true);
  assert.equal(covers(jim, '10:45'), false);
});

test('doctors without surgery that day are not blocked', () => {
  const blocks = surgeryBlocksByVet(monday, '2026-10-19', window);
  assert.equal(blocks.has('dalma'), false);
  assert.equal(surgeryBlocksByVet(monday.filter((a) => a.type === 'consult'), '2026-10-19', window).size, 0);
});

test('a surgery running past the window keeps the doctor blocked until it ends', () => {
  const late = [{ vet_id: 'jim', type: 'other_surgery', start_time: at('12:00'), duration_minutes: 120 }];
  const b = surgeryBlocksByVet(late, '2026-10-19', window).get('jim');
  assert.equal(b.start.toISOString(), at('12:00'));
  assert.equal(b.end.toISOString(), at('14:00'));
});
