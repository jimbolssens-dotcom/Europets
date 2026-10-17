// lib/prefetchData.js
// Starts a page's main data request the moment the pointer reaches a link
// to it (app/_components/InAppLinks.jsx), so by the click, or a moment
// after, the answer is already on its way or here. The consult, stay and
// invoice pages wait on one request before they can draw anything, and a
// pointer usually rests on a link for a few hundred milliseconds before
// the click: about the time that request takes.
//
// Unlike lib/viewCache.js this never shows old data: an answer is used
// once, by the page's first load, and only if it was asked for within the
// last few seconds. Every later reload (live updates, after a save) goes
// to the server as before.

const FRESH_MS = 5000;
const pending = new Map(); // url -> { promise, at }

// The data a page loads first, by page path.
const PAGE_DATA = [
  [/^\/consults\/([^/]+)$/, (id) => [`/api/visits/${id}`]],
  [/^\/hospitalization\/([^/]+)$/, (id) => (id === 'wall' || id === 'cages' ? [] : [`/api/hospitalizations/${id}`])],
  [/^\/invoices\/([^/]+)$/, (id) => [`/api/invoices/${id}`]],
  [/^\/patients\/([^/]+)$/, (id) => [`/api/patients/${id}`]],
  [/^\/clients\/([^/]+)$/, (id) => [`/api/clients/${id}`, `/api/patients?client_id=${id}`, `/api/invoices?client_id=${id}`]],
];

export function prefetchPageData(path) {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '');
  for (const [pattern, urls] of PAGE_DATA) {
    const match = clean.match(pattern);
    if (!match) continue;
    for (const url of urls(decodeURIComponent(match[1]))) {
      const existing = pending.get(url);
      if (existing && Date.now() - existing.at < FRESH_MS) continue;
      const promise = fetch(url).then((res) => res.json());
      promise.catch(() => pending.delete(url));
      pending.set(url, { promise, at: Date.now() });
    }
    return;
  }
}

// fetch(url).then((res) => res.json()), but using a request already made
// by prefetchPageData in the last few seconds if there is one.
export function fetchJsonPrefetched(url) {
  const entry = pending.get(url);
  pending.delete(url);
  if (entry && Date.now() - entry.at < FRESH_MS) return entry.promise;
  return fetch(url).then((res) => res.json());
}
