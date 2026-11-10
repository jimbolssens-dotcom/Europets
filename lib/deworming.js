// lib/deworming.js
// Deworming reminders (Jim, 8 Nov): a patient can be on a reminder every 3
// or 6 months (patients.deworm_interval_months, migration 245; 0 = turned
// off). Logging a dewormer switches it on at 6 months by itself unless
// staff chose otherwise (Jim, 10 Nov; migration 246's trigger). The due
// date counts on from the last deworming, the newer of the date staff set
// and the last time a dewormer was logged or charged, and keeps rolling on by the
// interval, so a client who never comes back still gets one reminder per
// period. Pure: used by the reminder run, the API and the chip.

export const DEWORM_INTERVALS = [3, 6];
export const DEWORM_REMIND_DAYS_BEFORE = 3;

function parse(iso) {
  return new Date(`${iso}T00:00:00Z`);
}
function iso(d) {
  return d.toISOString().slice(0, 10);
}

export function addMonths(isoDate, months) {
  const d = parse(isoDate);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
}

export function addDays(isoDate, days) {
  const d = parse(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

export function lastDeworming(manualDate, invoiceDate) {
  if (!manualDate) return invoiceDate || null;
  if (!invoiceDate) return manualDate;
  return manualDate > invoiceDate ? manualDate : invoiceDate;
}

// The next due date on or after today: last + n x interval (n >= 1).
export function nextDewormingDue({ intervalMonths, lastDate, today }) {
  if (!DEWORM_INTERVALS.includes(Number(intervalMonths)) || !lastDate) return null;
  let n = 1;
  let due = addMonths(lastDate, intervalMonths * n);
  while (due < today && n < 200) {
    n += 1;
    due = addMonths(lastDate, intervalMonths * n);
  }
  return due;
}

// Whether the daily run should remind today: due exactly
// DEWORM_REMIND_DAYS_BEFORE days from today and not already reminded for it.
export function dewormingReminderDue({ intervalMonths, lastDate, remindedFor, today }) {
  const due = nextDewormingDue({ intervalMonths, lastDate, today });
  if (!due) return null;
  if (due !== addDays(today, DEWORM_REMIND_DAYS_BEFORE)) return null;
  if (remindedFor === due) return null;
  return due;
}

export function dueLabel(isoDate) {
  return parse(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
