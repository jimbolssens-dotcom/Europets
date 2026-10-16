// lib/viewCache.js
// What a page last showed, kept in this browser so the next visit paints
// it straight away instead of a blank "Loading..." while the fresh copy
// is fetched (the Messages inbox and threads). Only a head start: the
// page always reloads from the server and replaces it moments later.
// Every read and write is wrapped, since storage can be full, blocked or
// missing (private window), and the page then just loads as before.

export function readViewCache(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeViewCache(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// A family of entries (one per conversation, say) that keeps only the
// `limit` most recently written, so it can't grow without end.
export function writeViewCacheEntry(prefix, id, value, limit = 20) {
  const indexKey = `${prefix}:index`;
  const index = (readViewCache(indexKey) || []).filter((k) => k !== id);
  index.unshift(id);
  for (const old of index.splice(limit)) {
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
