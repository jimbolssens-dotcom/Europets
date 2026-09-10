// lib/formatTimestamp.js
// Shared worksheet entry timestamp formatting — used on both the staff
// hospitalization page, the client portal, and the PDF summary.

const WORKSHEET_CONSOLIDATION_MINUTES = 10;

// Just the time ("8:15 AM") — for use under a day heading that already
// carries the date, so entries within a day aren't showing "Sep 1" over
// and over.
export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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

function sameAuthor(a, b) {
  return (a.author_id || null) === (b.author_id || null);
}

function timestampMs(entry) {
  const value = new Date(entry.created_at).getTime();
  return Number.isFinite(value) ? value : 0;
}

function firstPresent(entries, key) {
  for (const entry of entries) {
    const value = entry[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return entries[0]?.[key] ?? null;
}

function uniqueText(entries, key) {
  const seen = new Set();
  const values = [];
  // Read merged free text in chronological order even though the visible
  // worksheet itself is newest-first.
  for (const entry of [...entries].reverse()) {
    const value = typeof entry[key] === 'string' ? entry[key].trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values.join('\n');
}

function consolidateCluster(entries) {
  if (entries.length === 1) return entries[0];

  // The newest real row remains the representative id. That keeps existing
  // edit/attachment links valid while the worksheet displays nearby saves
  // as one logical entry. No database rows are deleted or rewritten.
  const newestFirst = [...entries].sort((a, b) => timestampMs(b) - timestampMs(a));
  const representative = newestFirst[0];
  const treatmentItems = newestFirst
    .flatMap((entry) => entry.treatment_items || [])
    .sort((a, b) => timestampMs(a) - timestampMs(b));

  return {
    ...representative,
    created_at: representative.created_at,
    weight_kg: firstPresent(newestFirst, 'weight_kg'),
    temperature_c: firstPresent(newestFirst, 'temperature_c'),
    appetite: firstPresent(newestFirst, 'appetite'),
    condition: firstPresent(newestFirst, 'condition'),
    drinking: firstPresent(newestFirst, 'drinking'),
    stool: firstPresent(newestFirst, 'stool'),
    urine: firstPresent(newestFirst, 'urine'),
    vomit: firstPresent(newestFirst, 'vomit'),
    mood: firstPresent(newestFirst, 'mood'),
    temperature_feel: firstPresent(newestFirst, 'temperature_feel'),
    client_summary: firstPresent(newestFirst, 'client_summary'),
    notes: uniqueText(newestFirst, 'notes'),
    treatment_items: treatmentItems,
    _consolidated_count: newestFirst.length,
    _consolidated_entry_ids: newestFirst.map((entry) => entry.id),
  };
}

function consolidateNearbyEntries(entries) {
  const newestFirst = [...entries].sort((a, b) => timestampMs(b) - timestampMs(a));
  const clusters = [];
  const windowMs = WORKSHEET_CONSOLIDATION_MINUTES * 60 * 1000;

  for (const entry of newestFirst) {
    const current = clusters[clusters.length - 1];
    if (!current) {
      clusters.push([entry]);
      continue;
    }

    const previous = current[current.length - 1];
    const gap = Math.abs(timestampMs(previous) - timestampMs(entry));
    if (sameAuthor(previous, entry) && gap <= windowMs) {
      current.push(entry);
    } else {
      clusters.push([entry]);
    }
  }

  return clusters.map(consolidateCluster);
}

// Groups worksheet entries by note_date and consolidates consecutive saves
// by the same staff member when they are no more than 10 minutes apart.
// This is display-only consolidation: the original database rows stay intact
// for audit/history, while the worksheet shows one timestamp/card for what
// was effectively one round of observations or treatments.
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

  return groups.map((group) => ({
    ...group,
    entries: consolidateNearbyEntries(group.entries),
  }));
}
