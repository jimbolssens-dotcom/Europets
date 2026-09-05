// lib/appointmentBooking.js
// Rules for a client's self-service booking request (see the public
// portal intake/booking form and app/api/booking-availability) — kept
// separate from lib/appointmentScheduling.js, which is about staff
// directly placing/moving a slot on the schedule.
//
// A client can only request a 15-min consult or one of the fixed
// standard spay/castration/dental durations below; anything more involved
// (a non-standard surgery) isn't self-bookable — the portal form tells
// them to contact the clinic directly instead. Spay/castration/dental all
// fall under a vet's surgery slots on the roster (can_surgery) — there's
// no separate dental flag, just the one "surgery/dental" capability.

export const CLIENT_APPOINTMENT_TYPES = ['consult', 'spay', 'castration', 'dental_small', 'dental_big'];

export const CLIENT_APPOINTMENT_TYPE_LABELS = {
  consult: 'Consult',
  spay: 'Spay',
  castration: 'Castration',
  dental_small: 'Dental Cleaning',
  dental_big: 'Dental / Extractions',
};

// Fallback if clinic_settings is somehow missing (its columns are all
// `not null default ...`, so this only matters for a settings row that
// predates migration 052 and hasn't been re-fetched).
const DEFAULT_BOOKING_HOURS = {
  booking_morning_start: '09:00',
  booking_morning_end: '13:00',
  booking_afternoon_start: '16:30',
  booking_afternoon_end: '19:00',
};

function timeToMinutes(timeStr, fallback) {
  const [h, m] = String(timeStr || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return h * 60 + m;
}

// The two windows a client can request a slot in, each day — editable on
// the Settings page (clinic_settings.booking_*, migration 052), usually
// 9am-1pm and 4:30pm-7pm. Distinct from the internal Appointments page's
// OPEN_HOUR/CLOSE_HOUR (08:00-19:00, staff-only booking) — these are
// narrower, client-facing hours, and map 1:1 onto the roster's
// 'morning'/'afternoon' shifts (see lib/appointmentScheduling.js's SHIFTS)
// so a slot only shows up here when a roster'd doctor is actually flagged
// in for the matching kind.
export function buildClientBookingWindows(clinicSettings) {
  const s = { ...DEFAULT_BOOKING_HOURS, ...clinicSettings };
  return [
    {
      shift: 'morning',
      startMinutes: timeToMinutes(s.booking_morning_start, 9 * 60),
      endMinutes: timeToMinutes(s.booking_morning_end, 13 * 60),
    },
    {
      shift: 'afternoon',
      startMinutes: timeToMinutes(s.booking_afternoon_start, 16 * 60 + 30),
      endMinutes: timeToMinutes(s.booking_afternoon_end, 19 * 60),
    },
  ];
}

const DOG_SPAY_WEIGHT_THRESHOLD_KG = 25;

// Normalizes the free-text `patients.species` field down to 'cat' or
// 'dog' — anything else (species isn't a constrained enum in the schema)
// falls back to the dog duration, the more conservative (longer) of the
// two for spay/castration.
function normalizeSpecies(species) {
  const s = String(species || '').trim().toLowerCase();
  if (s.startsWith('cat')) return 'cat';
  return 'dog';
}

// Returns null for a type/species/weight combination that isn't a fixed
// standard duration (the caller should fall back to "contact the clinic").
export function clientBookingDurationMinutes(appointmentType, species, weightKg) {
  if (appointmentType === 'consult') return 15;

  const isCat = normalizeSpecies(species) === 'cat';

  if (appointmentType === 'castration') {
    return isCat ? 15 : 30;
  }

  if (appointmentType === 'spay') {
    if (isCat) return 30;
    const weight = Number(weightKg);
    return Number.isFinite(weight) && weight > DOG_SPAY_WEIGHT_THRESHOLD_KG ? 45 : 30;
  }

  if (appointmentType === 'dental_small') return 30;
  if (appointmentType === 'dental_big') return 45;

  return null;
}
