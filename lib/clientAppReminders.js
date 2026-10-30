// lib/clientAppReminders.js
// Which vaccination reminders the client app's home shows. Jim: for
// people with a lot of pets, only what's due in the next two weeks (or
// only just gone overdue) should show; the rest kept somewhere quiet. So
// the home shows `soon` and tucks `later` behind a "more reminders" line.
// Pets that have died or been rehomed are left out. Pure, so it can be
// tested (tests/client-app-reminders.test.mjs).

export const SOON_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

// Today's date in the UAE (YYYY-MM-DD) and the date `days` from it.
function uaeDay(now, days = 0) {
  return new Date(now + 4 * 60 * 60 * 1000 + days * DAY_MS).toISOString().slice(0, 10);
}

// rows: /api/vaccinations?due=true&client_id= rows ({ next_due_date,
// patients: { name, deceased, rehomed } }).
export function splitVaccineReminders(rows, now = Date.now()) {
  const from = uaeDay(now, -SOON_DAYS);
  const to = uaeDay(now, SOON_DAYS);
  const soon = [];
  const later = [];
  for (const row of rows || []) {
    if (!row?.next_due_date || row.patients?.deceased || row.patients?.rehomed) continue;
    const date = String(row.next_due_date).slice(0, 10);
    (date >= from && date <= to ? soon : later).push(row);
  }
  const byDate = (a, b) => String(a.next_due_date).localeCompare(String(b.next_due_date));
  return { soon: soon.sort(byDate), later: later.sort(byDate) };
}
