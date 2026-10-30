// lib/consentRequestRelevance.js
// Whether an unsigned consent form request still belongs on the client
// app's home. Unsigned ones used to stay there for good, weeks after the
// pet went home (a rescuer's page filled up with them). One drops off
// once what it was for is over: a day after the stay's discharge or the
// cattery check-out (or the booking being cancelled or declined), three
// days after a consult. Nothing is deleted; staff still see every
// request. Pure, so it can be tested (tests/consent-request-relevance.test.mjs).

const DAY_MS = 24 * 60 * 60 * 1000;
const ENDED_BOOKING = new Set(['checked_out', 'cancelled', 'declined']);

const olderThan = (value, ms, now) => value != null && now - Date.parse(value) > ms;

// row: { visit_id, hospitalization_id, cattery_booking_id }; stays: Maps of
// id -> { discharged_at } (hospitalizations), { started_at } (visits),
// { status, updated_at, date_out } (cattery bookings).
export function consentRequestStillWanted(row, { visits, hospitalizations, catteryBookings }, now = Date.now()) {
  if (row.hospitalization_id) {
    const h = hospitalizations.get(row.hospitalization_id);
    return !h || !olderThan(h.discharged_at, DAY_MS, now);
  }
  if (row.visit_id) {
    const v = visits.get(row.visit_id);
    return !v || !olderThan(v.started_at, 3 * DAY_MS, now);
  }
  if (row.cattery_booking_id) {
    const b = catteryBookings.get(row.cattery_booking_id);
    if (!b) return true;
    if (ENDED_BOOKING.has(b.status)) return !olderThan(b.updated_at, DAY_MS, now);
    return !(b.date_out && olderThan(`${b.date_out}T23:59:59+04:00`, DAY_MS, now));
  }
  return true;
}
