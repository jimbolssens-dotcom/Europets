// lib/storageUpload.js
// Client-side: uploads a file to Supabase Storage, trying again after a
// dropped connection ("Failed to fetch") or a server hiccup (e.g. a 520), so
// a phone or laptop on patchy clinic wifi doesn't lose what it was sending.
// Used by Social uploads (lib/socialUpload.js) and dictations
// (lib/recordings.js).

import { supabase } from '@/lib/supabaseClient';

const TRIES = 3;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// If an earlier try did arrive and only the answer was lost, the file is
// already there, which counts as done.
export async function uploadWithRetry(bucket, path, body, contentType) {
  let lastError;
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    try {
      const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType });
      if (!error || /already exists|duplicate/i.test(error.message || '')) return;
      lastError = error;
    } catch (err) {
      lastError = err;
    }
    if (attempt < TRIES) await wait(attempt * 2000);
  }
  throw lastError;
}
