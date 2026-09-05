// lib/appointmentBooking.js
// Rules for a client's self-service booking request (see the public
// portal intake/booking form and app/api/booking-availability) — kept
// separate from lib/appointmentScheduling.js, which is about staff
// directly placing/moving a slot on the schedule.
//
// A client can pick an exact slot for a 15-min consult or one of the
// fixed standard spay/castration/dental durations below. Anything else
// non-standard ('other_surgery') is still self-*requestable* — the client
// describes it and suggests a preferred day instead of an exact time,
// since they've no way to know how long it'll take; staff schedule the
// actual slot when approving it (see app/api/intake-requests/[id]).
// Spay/castration/dental/other_surgery all fall under a vet's surgery
// slots on the roster (can_surgery) — there's no separate dental flag,
// just the one "surgery/dental" capability — and, per clinic policy,
// surgeries are only ever offered/booked in the morning window regardless
// of what shift that flag happens to be set on (see
// app/api/booking-availability, which filters to 'morning' for anything
// but a consult).

export const CLIENT_APPOINTMENT_TYPES = ['consult', 'spay', 'castration', 'dental_small', 'dental_big', 'other_surgery'];

export const CLIENT_APPOINTMENT_TYPE_LABELS = {
  consult: 'Consult',
  spay: 'Spay',
  castration: 'Castration',
  dental_small: 'Dental Cleaning',
  dental_big: 'Dental / Extractions',
  other_surgery: 'Something else (describe below)',
};

// Surgery-ish types (everything but a consult) are only ever scheduled in
// the morning — used both to restrict available slots and to show the
// client a clear heads-up on the booking form.
export function isSurgeryType(appointmentType) {
  return appointmentType !== 'consult';
}

// A spay only makes sense for a female and a castration only for a male —
// checked against patients.sex ('male', 'female', 'male_castrated',
// 'female_spayed', or '' / null when unknown). Unknown sex allows both,
// since there's nothing to rule out; every other type (consult, dental,
// other_surgery) applies regardless of sex.
export function appointmentTypeAllowedForSex(appointmentType, sex) {
  if (appointmentType === 'spay') return sex !== 'male' && sex !== 'male_castrated';
  if (appointmentType === 'castration') return sex !== 'female' && sex !== 'female_spayed';
  return true;
}

// The appointment type dropdown, filtered down to what makes sense for
// this pet's sex (see appointmentTypeAllowedForSex) — e.g. a male pet
// never sees "Spay" as an option.
export function clientAppointmentTypeEntriesForSex(sex) {
  return Object.entries(CLIENT_APPOINTMENT_TYPE_LABELS).filter(([value]) => appointmentTypeAllowedForSex(value, sex));
}

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

// Returns null for 'other_surgery' (no fixed duration — staff set one on
// approval) or any unrecognized type.
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
