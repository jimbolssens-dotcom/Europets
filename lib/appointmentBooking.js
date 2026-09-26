// lib/appointmentBooking.js
// Rules for a client's self-service booking request (see the public
// portal intake/booking form, app/api/booking-availability, and the
// WhatsApp AI concierge — lib/whatsappConcierge.js) — kept separate from
// lib/appointmentScheduling.js, which is about staff directly placing/
// moving a slot on the schedule.
//
// A client can pick an exact slot for a 15-min consult or one of the
// fixed standard spay/castration/dental durations below. Anything else
// non-standard ('other_surgery') is still self-*requestable* — the client
// describes it and suggests a preferred day instead of an exact time,
// since they've no way to know how long it'll take; staff schedule the
// actual slot when approving it (see app/api/intake-requests/[id]).
// Spay/castration/dental/other_surgery all fall under a vet's surgery
// slots on the roster (can_surgery) — there's no separate dental flag,
// just the one "surgery/dental" capability — and, per clinic policy, a vet
// must be rostered for the 'morning' shift to take one at all (see
// app/api/booking-availability, which filters to 'morning' for anything
// but a consult). The actual clock window offered is its own, stricter
// window than a plain consult's — see buildSurgeryBookingWindow below
// (migration 147): no surgery before 10:30am, and every slot must finish
// by 1pm regardless of how late the general morning window runs.

export const CLIENT_APPOINTMENT_TYPES = [
  'consult',
  'video',
  'spay',
  'castration',
  'dental_small',
  'dental_big',
  'other_surgery',
];

export const CLIENT_APPOINTMENT_TYPE_LABELS = {
  consult: 'Consult',
  video: 'Video Consult',
  spay: 'Spay',
  castration: 'Castration',
  dental_small: 'Dental Cleaning',
  dental_big: 'Dental / Extractions',
  other_surgery: 'Something else (describe below)',
};

// Surgery-ish types (everything but a consult or a video consult) are
// only ever scheduled in the morning — used both to restrict available
// slots and to show the client a clear heads-up on the booking form. A
// video consult keeps a consult's own full-day availability — there's no
// physical room to run out of.
export function isSurgeryType(appointmentType) {
  return appointmentType !== 'consult' && appointmentType !== 'video';
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
  booking_surgery_start: '10:30',
  booking_surgery_end: '13:00',
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

// The stricter window surgery-type appointments (spay/castration/dental —
// see isSurgeryType) are offered in, separate from the general morning
// window above — clinic policy: no surgery before 10:30am, and every slot
// must finish by 1pm (anesthesia/recovery needs the afternoon clear).
// Editable on the Settings page (migration 147), same pattern as the
// morning/afternoon windows.
export function buildSurgeryBookingWindow(clinicSettings) {
  const s = { ...DEFAULT_BOOKING_HOURS, ...clinicSettings };
  return {
    startMinutes: timeToMinutes(s.booking_surgery_start, 10 * 60 + 30),
    endMinutes: timeToMinutes(s.booking_surgery_end, 13 * 60),
  };
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
  if (appointmentType === 'consult' || appointmentType === 'video') return 15;

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

const SLOT_STEP_MINUTES = 15;

function uaeIso(date, time) {
  return `${date}T${time}:00.000+04:00`;
}

function minutesToTime(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// The open self-service slots for one day — shared by the public
// booking-availability route (app/api/booking-availability, the client
// portal's own booking form) and the WhatsApp AI concierge
// (lib/whatsappConcierge.js), so both walk the exact same roster/conflict
// logic instead of the concierge re-implementing (or second-guessing) it.
// Takes `supabase` as a parameter rather than importing a client directly
// — this file is also imported by client components (the portal booking
// form), so it can't assume a server-only import is safe, and the two
// callers already have their own client instance to pass in anyway.
//
// Returns { error, status } on a bad request or a query failure — never
// throws — so a caller can turn that straight into an HTTP response (the
// route) or a tool_result the AI can read and react to (the concierge)
// without its own try/catch.
export async function computeAvailableSlots(supabase, { date, type, species, weightKg }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'a valid date (YYYY-MM-DD) is required', status: 400 };
  }
  if (!CLIENT_APPOINTMENT_TYPES.includes(type)) {
    return { error: `type must be one of ${CLIENT_APPOINTMENT_TYPES.join(', ')}`, status: 400 };
  }

  const duration = clientBookingDurationMinutes(type, species, weightKg);
  if (!duration) {
    return { error: 'could not determine a standard duration for that request', status: 400 };
  }

  const capabilityColumn = type === 'consult' || type === 'video' ? 'can_consult' : 'can_surgery';
  const dayStart = new Date(uaeIso(date, '00:00'));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // Only doctors are ever bookable through the client portal — a cleaner
  // or admin staff member on the roster (even one accidentally left with
  // can_consult/can_surgery set) must never show up here.
  let rosterQuery = supabase
    .from('staff_roster_entries')
    .select('staff_id, shift, staff!inner(full_name, role)')
    .eq('date', date)
    .eq(capabilityColumn, true)
    .eq('staff.role', 'vet');
  if (isSurgeryType(type)) {
    rosterQuery = rosterQuery.eq('shift', 'morning');
  }

  const [{ data: roster, error: rosterError }, { data: dayAppointments, error: apptError }, { data: clinicSettings, error: settingsError }] =
    await Promise.all([
      rosterQuery,
      supabase
        .from('appointments')
        .select('vet_id, start_time, duration_minutes')
        .neq('status', 'cancelled')
        .gte('start_time', dayStart.toISOString())
        .lt('start_time', dayEnd.toISOString()),
      supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    ]);

  if (rosterError) return { error: rosterError.message, status: 500 };
  if (apptError) return { error: apptError.message, status: 500 };
  if (settingsError) return { error: settingsError.message, status: 500 };

  const bookingWindows = buildClientBookingWindows(clinicSettings);
  const surgeryWindow = buildSurgeryBookingWindow(clinicSettings);

  const appointmentsByVet = new Map();
  for (const appt of dayAppointments || []) {
    if (!appt.vet_id) continue;
    if (!appointmentsByVet.has(appt.vet_id)) appointmentsByVet.set(appt.vet_id, []);
    appointmentsByVet.get(appt.vet_id).push(appt);
  }

  function isVetFree(vetId, slotStart, slotEnd) {
    const existing = appointmentsByVet.get(vetId) || [];
    return !existing.some((appt) => {
      const apptStart = new Date(appt.start_time);
      const apptEnd = new Date(apptStart.getTime() + appt.duration_minutes * 60000);
      return apptStart < slotEnd && slotStart < apptEnd;
    });
  }

  const slots = [];
  for (const entry of roster || []) {
    // A surgery-type booking uses its own stricter clock window regardless
    // of the roster shift's normal hours — the roster query above already
    // restricted these to vets on the 'morning' shift, but the bookable
    // times within that shift are narrower (10:30am-1pm, not 9am-1pm).
    const window = isSurgeryType(type) ? surgeryWindow : bookingWindows.find((w) => w.shift === entry.shift);
    if (!window) continue;

    for (let startMin = window.startMinutes; startMin + duration <= window.endMinutes; startMin += SLOT_STEP_MINUTES) {
      const slotStart = new Date(uaeIso(date, minutesToTime(startMin)));
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);
      if (!isVetFree(entry.staff_id, slotStart, slotEnd)) continue;
      slots.push({
        vet_id: entry.staff_id,
        vet_name: entry.staff?.full_name || 'Available doctor',
        shift: entry.shift,
        start_time: slotStart.toISOString(),
        duration_minutes: duration,
      });
    }
  }

  slots.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.vet_name.localeCompare(b.vet_name));

  return { duration_minutes: duration, slots };
}
