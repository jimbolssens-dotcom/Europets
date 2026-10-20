// lib/scheduleRoomOrder.js
// The order of the room columns on the Appointments schedule: the consult
// rooms, then the surgery rooms next to them, then any other clinical room,
// and Grooming and the Staff Room (migrations 208, 109) last, on the far
// right. Within each group, by name (so Consult 1, 2, 3). Pure, so it can
// be tested (tests/schedule-room-order.test.mjs).

function group(room) {
  if (room.type === 'staff') return 5;
  if (room.type === 'grooming') return 4;
  if (room.type === 'surgery') return 2;
  if (room.type === 'consult' && /^consult/i.test(String(room.name || '').trim())) return 1;
  return 3;
}

export function sortScheduleRooms(rooms) {
  return [...(rooms || [])].sort(
    (a, b) => group(a) - group(b) || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true })
  );
}
