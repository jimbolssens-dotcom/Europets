// lib/formatTimestamp.js
// Shared worksheet entry timestamp formatting — used on both the staff
// hospitalization page, the client portal, and the PDF summary.

// Just the time ("8:15 AM") — for use under a day heading that already
// carries the date, so entries within a day aren't showing "Sep 1" over
// and over.
export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// "01/09/2026" — day/month/year numeric, the clinic's one date format used
// everywhere (a plain numeric date is otherwise ambiguous — 9/1 reads as
// September 1st in the US locale this app would inherit from the browser —
// and a spelled-out month reads differently place to place, which is its
// own kind of inconsistency). Every date display in the app goes through
// one of the functions below rather than calling toLocaleDateString/
// toLocaleString directly, so the format can't drift back out of sync one
// call site at a time.
export function formatShortDate(input) {
  return new Date(input).toLocaleDateString('en-GB');
}

// "Monday, 01/09/2026" for a 'YYYY-MM-DD' note_date — weekday name plus the
// numeric date, for a day-section heading. Parsed with an explicit local
// midnight (no trailing Z) so it doesn't shift a day when the viewer is
// behind UTC.
export function formatDayHeader(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// "05/09/2026, 11:42 pm" — a full date+time stamp, e.g. for when a client's
// hospitalization update request came in (see lib/officeHours). hour12 is
// forced explicitly since en-GB otherwise defaults to a 24-hour clock —
// only the date part needed to change, not the time-of-day style.
export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// "05/09, 11:42 pm" — formatDateTime without the year, for space-constrained
// list rows (mobile schedule, intake review cards) that don't need the year
// repeated on every line.
export function formatShortDateTime(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Groups worksheet entries by note_date, preserving each group's entry
// order from the input array — every entry that comes in appears in the
// output, just organized under its day, so nothing is ever dropped from
// view even as new entries land above older ones.
export function groupNotesByDate(notes) {
  const groups = [];
  const byDate = new Map();
  for (const n of notes) {
    let group = byDate.get(n.note_date);
    if (!group) {
      group = { date: n.note_date, entries: [] };
      byDate.set(n.note_date, group);
      groups.push(group);
    }
    group.entries.push(n);
  }
  return groups;
}
