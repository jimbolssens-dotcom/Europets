// lib/formatTimestamp.js
// Shared worksheet entry timestamp formatting — used on both the staff
// hospitalization page, the client portal, and the PDF summary.

// Just the time ("8:15 AM") — for use under a day heading that already
// carries the date, so entries within a day aren't showing "Sep 1" over
// and over.
export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// "01/09/2026" — day/month/year numeric, the clinic's preferred short-date
// format (a plain numeric date is ambiguous otherwise — 9/1 reads as
// September 1st in the US locale this app would otherwise inherit from
// the browser). Every bare, options-less toLocaleDateString() call in the
// app goes through this instead so that ambiguity can't creep back in one
// call site at a time. Named dates elsewhere ("September 1, 2026") aren't
// ambiguous and don't need this — see formatDayHeader/formatDateTime.
export function formatShortDate(input) {
  return new Date(input).toLocaleDateString('en-GB');
}

// "Monday, September 1, 2026" for a 'YYYY-MM-DD' note_date. Parsed with an
// explicit local midnight (no trailing Z) so it doesn't shift a day when
// the viewer is behind UTC.
export function formatDayHeader(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// "Sep 5, 2026, 11:42 PM" — a full date+time stamp, e.g. for when a
// client's hospitalization update request came in (see lib/officeHours).
export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
