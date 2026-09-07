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

const STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'will', 'into', 'about', 'their', 'there',
]);

function significantWords(text) {
  return new Set(
    normalize(text)
      .split(' ')
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
}

// Cuts a large catalog down to the items plausibly relevant to this
// transcript before it ever reaches an extraction prompt. Grounding the
// prompt with catalog names (so the model copies exact spelling) works
// fine at a small clinic's catalog size, but doesn't scale — one clinic's
// catalog reached ~900 active items, and sending every single name on
// every single recording added enough tokens to occasionally push a call
// past the platform's function timeout, leaving the recording stuck
// "processing" forever with no error ever recorded. `candidates` itself is
// left untouched for the caller's own post-extraction matchCatalogItem
// lookup, which needs full recall and costs nothing (it's local, not a
// prompt) — only the names handed to the model are filtered.
export function filterRelevantCatalogItems(transcript, candidates, maxCount = 150) {
  if (candidates.length <= maxCount) return candidates;

  const words = significantWords(transcript);
  const relevant = candidates.filter((c) => {
    const nameWords = normalize(c.name)
      .split(' ')
      .filter((w) => w.length >= 4);
    return nameWords.some((w) => words.has(w));
  });

  return (relevant.length > 0 ? relevant : candidates).slice(0, maxCount);
}
