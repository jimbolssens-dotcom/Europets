// lib/cattery.js
// Shared rules for cattery boarding (migrations/167): the clinic's 7
// cattery spaces, the list of days a booking covers, and the evening
// weight alarm. Used by app/api/cattery/*, the Cattery pages and the nav
// bell, so they all agree on what "needs attention" means.
//
// Dates are plain 'YYYY-MM-DD' strings in Dubai local time (the clinic's
// calendar day), never timestamps, so they compare as strings.

import { dubaiLocalDateString } from './dubaiTime';

export const CATTERY_SPACES = [1, 2, 3, 4, 5, 6, 7];

// The weight has to be in by 18:00 Dubai time each day the cat is
// checked in; after that the booking (and the Cattery nav link) goes red.
export const CATTERY_WEIGHT_DEADLINE_HOUR = 18;

export const DEFAULT_DEWORMING_PRODUCT = 'Dewormin';
export const DEFAULT_EXTERNAL_PARASITE_PRODUCT = 'Fiprotec';

export function catteryToday(now = new Date()) {
  return dubaiLocalDateString(now);
}

function dubaiHour(now = new Date()) {
  return (now.getUTCHours() + 4) % 24;
}

// Every date from date_in to date_out inclusive.
export function bookingDays(dateIn, dateOut) {
  const days = [];
  if (!dateIn || !dateOut) return days;
  const d = new Date(`${dateIn}T00:00:00Z`);
  const end = new Date(`${dateOut}T00:00:00Z`);
  while (d <= end && days.length < 400) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export function weekdayName(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}

// UAE weekend, shaded on the sheet the same way the paper version is.
export function isWeekend(isoDate) {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 5 || day === 6;
}

// True when a cat on this booking is in the cattery today and its weight
// for today still hasn't been recorded after the evening deadline. `logs`
// is the booking's cattery_daily_logs rows (or just today's). A shared
// bungalow (migration 183) needs every cat weighed. Pass `patientId` to
// ask about one cat only.
export function weightOverdue(booking, logs, now = new Date(), patientId = null) {
  if (!booking || booking.status !== 'checked_in') return false;
  const today = catteryToday(now);
  if (today < booking.date_in || today > booking.date_out) return false;
  if (dubaiHour(now) < CATTERY_WEIGHT_DEADLINE_HOUR) return false;
  const cats = patientId ? [patientId] : bookingCats(booking).map((c) => c.id);
  return cats.some((catId) => {
    const todayLog = (logs || []).find((l) => l.log_date === today && logPatientId(l, booking) === catId);
    return !(todayLog && todayLog.weight_kg !== null && todayLog.weight_kg !== undefined && todayLog.weight_kg !== '');
  });
}

// Two bookings for the same space clash when their date ranges overlap
// and neither is cancelled.
export function rangesOverlap(aIn, aOut, bIn, bOut) {
  return aIn <= bOut && bIn <= aOut;
}

// Every cat on a booking: the booking's own cat first, then any others
// from the same household sharing the space (cattery_booking_cats,
// migration 183). Each is { id, name, ... } from patients.
export function bookingCats(booking) {
  if (!booking) return [];
  const first = booking.patients ? { ...booking.patients, id: booking.patients.id || booking.patient_id } : { id: booking.patient_id };
  const extra = (booking.cattery_booking_cats || []).map((c) => ({ ...(c.patients || {}), id: c.patient_id }));
  return [first, ...extra].filter((c) => c.id);
}

// "Plomo & Chubbers" for a shared bungalow, else the one cat's name.
export function catNames(booking, fallback = '') {
  const names = bookingCats(booking).map((c) => c.name).filter(Boolean);
  if (names.length === 0) return fallback;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// A daily-log row's cat. Rows saved before migration 183 have none and
// belong to the booking's own cat.
export function logPatientId(log, booking) {
  return log?.patient_id || booking?.patient_id;
}
