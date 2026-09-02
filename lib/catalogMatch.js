// lib/catalogMatch.js
// Best-effort matching of a spoken/free-text item name against the
// goods_services catalog — used when the AI recording pipeline extracts
// diagnostics/treatments mentioned during a consult and needs to link them
// to real catalog items instead of inventing new ones.

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Returns the best-matching item in `candidates` for `name`, or null if
// nothing matches closely enough. Exact match (normalized) wins; otherwise
// a substring match in either direction, preferring the longest candidate
// name among ties (the more specific match).
export function matchCatalogItem(name, candidates) {
  const target = normalize(name);
  if (!target) return null;

  const exact = candidates.find((c) => normalize(c.name) === target);
  if (exact) return exact;

  const substringMatches = candidates.filter((c) => {
    const cn = normalize(c.name);
    return cn && (target.includes(cn) || cn.includes(target));
  });
  if (substringMatches.length === 0) return null;

  return substringMatches.sort((a, b) => b.name.length - a.name.length)[0];
}
