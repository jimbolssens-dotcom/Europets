// lib/rosterDefaults.js
// The standard consult/surgery capability a new roster entry gets when
// nothing else is specified (adding someone to a shift on the Staff
// Roster page, or copying a previous week onto a new one): a doctor is
// assumed available for both consult and surgery bookings in the
// morning, consult-only in the afternoon — except Dr. Jim Bolssens, who
// is consult-only on both shifts. Explicitly toggling a shift's C/S
// badges afterwards (see toggleCapability) always overrides this.
const JIM_BOLSSENS_PATTERN = /\bjim\s+bolssens\b/i;

export function defaultRosterCapabilities(shift, staffFullName) {
  if (JIM_BOLSSENS_PATTERN.test(staffFullName || '')) {
    return { can_consult: true, can_surgery: false };
  }
  return { can_consult: true, can_surgery: shift === 'morning' };
}
