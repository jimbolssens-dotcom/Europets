// lib/passedAway.js
// A patient that passed away in hospital (migration 261, Jim, 22 Nov): until
// a staff member records that the owner was told, every staff screen shows
// the biggest alarm there is. Nothing of it reaches the owner's portal or
// app (hiddenFromClient below): they hear it from us, never from a screen.

export const PASSED_AWAY_FIELDS = ['passed_away_at', 'passed_away_by', 'owner_informed_at', 'owner_informed_by', 'owner_informed_how'];

// Passed away and the owner hasn't been told yet.
export function ownerNotTold(hosp) {
  return !!(hosp && hosp.passed_away_at && !hosp.owner_informed_at);
}

// A stay as the owner's portal / app may see it: no trace of the death
// until a staff member has told the owner; after that only the date, so the
// portal can say it gently instead of "Discharged".
export function hiddenFromClient(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const f of PASSED_AWAY_FIELDS) delete out[f];
  if (row.passed_away_at && row.owner_informed_at) out.passed_away_on = row.passed_away_at;
  return out;
}

export const INFORMED_HOW = [
  { value: 'phone', label: 'Phone call' },
  { value: 'in_person', label: 'In person' },
  { value: 'video', label: 'Video call' },
];
