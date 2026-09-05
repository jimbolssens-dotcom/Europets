// lib/staffAuth.js
// Shared helper for the staff-wide password gate (see middleware.js) —
// same basic keep-casual-visitors-out measure as lib/accountingAuth.js,
// not real per-user auth. One shared passphrase for everyone on staff,
// checked against a cookie holding sha256(password). /accounting layers
// its own extra password on top of this for the owner/accountant-only
// pages — see lib/accountingAuth.js.

export const STAFF_COOKIE = 'staff_auth';
