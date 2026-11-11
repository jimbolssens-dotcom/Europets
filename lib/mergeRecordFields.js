// lib/mergeRecordFields.js
// The consult form keeps what the vet is typing when the server's copy of
// the consult changes underneath it (a recording finishing, a treatment
// note added from the catalog). Before 11 Nov a field the vet had touched
// simply kept the vet's version, so text the recording ADDED to that field
// (the plan from a dictated consult) was dropped, and the next Save wrote
// over it. Now an addition on the server side is kept too: the vet's own
// text, then whatever the server added that isn't already there.

// local: what's in the form now; previous: the server copy the form last
// took in; server: the server copy just fetched.
export function mergeRecordFields(local, previous, server) {
  if (!local || !previous) return { ...server };
  const merged = { ...server };
  for (const field of Object.keys(server)) {
    const mine = local[field];
    const before = previous[field];
    const now = server[field];
    if (mine === before) continue; // untouched here: take the server's
    if (now === before) {
      merged[field] = mine; // only changed here: keep mine
      continue;
    }
    // Changed in both places.
    if (typeof now === 'string' && typeof before === 'string' && typeof mine === 'string' && now.startsWith(before)) {
      const added = now.slice(before.length).trim();
      merged[field] = !added || mine.includes(added) ? mine : mine.trim() ? `${mine.trimEnd()}\n\n${added}` : added;
    } else {
      merged[field] = mine; // a real conflict (not an addition): the vet's edit wins, as before
    }
  }
  return merged;
}
