// lib/formatTimestamp.js
// Shared "Aug 31, 3:45 PM" formatting for worksheet entry timestamps —
// used on both the staff hospitalization page and the client portal.

export function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// True once an entry has actually been edited after creation (a few
// seconds' grace since both timestamps default to the same `now()` on
// insert, and PostgREST timestamp precision can otherwise make them
// differ by a hair even when nothing was edited).
export function wasEdited(createdAt, updatedAt) {
  return updatedAt && new Date(updatedAt) - new Date(createdAt) > 5000;
}
