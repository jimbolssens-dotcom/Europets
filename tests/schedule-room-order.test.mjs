import test from 'node:test';
import assert from 'node:assert/strict';
import { sortScheduleRooms } from '../lib/scheduleRoomOrder.js';

test('surgery rooms sit next to the consult rooms, grooming and the staff room last', () => {
  const rooms = [
    { name: 'Consult 1', type: 'consult' }, { name: 'Consult 2', type: 'consult' }, { name: 'Consult 3', type: 'consult' },
    { name: 'Grooming', type: 'grooming' }, { name: 'Staff ', type: 'consult' }, { name: 'Staff Room', type: 'staff' },
    { name: 'Surgery 1', type: 'surgery' }, { name: 'Surgery 2', type: 'surgery' }, { name: 'Consult 10', type: 'consult' },
  ];
  assert.deepEqual(sortScheduleRooms(rooms).map((r) => r.name), [
    'Consult 1', 'Consult 2', 'Consult 3', 'Consult 10', 'Surgery 1', 'Surgery 2', 'Staff ', 'Grooming', 'Staff Room',
  ]);
});
