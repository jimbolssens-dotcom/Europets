// lib/viewCache.js
// What a page last showed, kept in this browser so the next visit paints
// it straight away instead of a blank "Loading..." while the fresh copy
// is fetched (the Messages inbox and threads). Only a head start: the
// page always reloads from the server and replaces it moments later.
// Every read and write is wrapped, since storage can be full, blocked or
// missing (private window), and the page then just loads as before.
// A copy is also kept in memory, so moving between pages inside the app
// (app/_components/InAppLinks.jsx) doesn't even have to read storage.

import { useLayoutEffect } from 'react';

const memory = new Map();

export function readViewCache(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : null;
    if (value != null) memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

// Browser storage is about 5MB for the whole app, so a big list (every
// invoice, every consult) is kept in memory only: still instant when
// moving between pages, just not after closing the tab.
const MAX_STORED_CHARS = 400_000;

export function writeViewCache(key, value) {
  memory.set(key, value);
  try {
    const json = JSON.stringify(value);
    if (json.length > MAX_STORED_CHARS) {
      window.localStorage.removeItem(key);
      return true;
    }
    window.localStorage.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

// Before the page's first paint, hands the last saved copy (if any) to
// `restore`. Pair with writeViewCache(key, ...) wherever the page's fresh
// data arrives. `key` should include anything the data depends on (a
// filter, a month), so a different view never shows another's copy.
export function useRestoredView(key, restore) {
  useLayoutEffect(() => {
    if (!key) return;
    const cached = readViewCache(key);
    if (cached != null) restore(cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// A family of entries (one per conversation, say) that keeps only the
// `limit` most recently written, so it can't grow without end.
export function writeViewCacheEntry(prefix, id, value, limit = 20) {
  const indexKey = `${prefix}:index`;
  const index = (readViewCache(indexKey) || []).filter((k) => k !== id);
  index.unshift(id);
  for (const old of index.splice(limit)) {
    memory.delete(`${prefix}:${old}`);
    try {
      window.localStorage.removeItem(`${prefix}:${old}`);
    } catch {
      // ignore
    }
  }
  writeViewCache(indexKey, index);
  if (!writeViewCache(`${prefix}:${id}`, value)) {
    // Storage full: drop this family's other entries and try once more.
    for (const old of index.slice(1)) {
      memory.delete(`${prefix}:${old}`);
      try {
        window.localStorage.removeItem(`${prefix}:${old}`);
      } catch {
        // ignore
      }
    }
    writeViewCache(indexKey, [id]);
    writeViewCache(`${prefix}:${id}`, value);
  }
}

export function readViewCacheEntry(prefix, id) {
  return readViewCache(`${prefix}:${id}`);
}
