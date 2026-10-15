// lib/dayProcedureSchedule.js
// Day procedures booked ahead (migration 193): from a consult that ran
// late or a full day, the procedure is pushed to a later date while the
// patient stays in a cage overnight. Its day is scheduled_for; an ordinary
// same-day procedure's day is still the date it was admitted.

export function dubaiDateISO(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
}

export function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(fromISO, toISO) {
  return Math.round((new Date(`${toISO}T00:00:00Z`) - new Date(`${fromISO}T00:00:00Z`)) / 86400000);
}

export function dayProcedureDate(h) {
  return h?.scheduled_for || h?.admitted_at?.slice(0, 10) || null;
}

// Waiting overnight for a procedure on a later day.
export function isBookedAhead(h, todayISO) {
  return !!h?.scheduled_for && h.status === 'admitted' && h.scheduled_for > todayISO;
}

export function shortDayLabel(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
