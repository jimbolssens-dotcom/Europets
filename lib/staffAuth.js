// lib/staffAuth.js
// Shared helper for the staff-wide PIN gate (see middleware.js) — same
// basic keep-casual-visitors-out measure as lib/accountingAuth.js, not
// real per-user auth. One shared PIN for everyone on staff, checked
// against a cookie holding sha256(pincode). /accounting layers its own
// extra password on top of this for the owner/accountant-only pages —
// see lib/accountingAuth.js.

export const STAFF_COOKIE = 'staff_auth';
