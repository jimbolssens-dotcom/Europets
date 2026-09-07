// lib/staffAuth.js
// Shared helper for the staff-wide PIN gate (see middleware.js) — same
// basic keep-casual-visitors-out measure as lib/accountingAuth.js, not
// real per-user auth. One shared PIN for everyone on staff, checked
// against a cookie holding sha256(pincode). /accounting layers its own
// extra password on top of this for the owner/accountant-only pages —
// see lib/accountingAuth.js.

import { sha256Hex } from '@/lib/accountingAuth';

export const STAFF_COOKIE = 'staff_auth';

// Re-checks the staff cookie from inside a route handler — for the rare
// route that's reachable without the PIN at the middleware level (a
// public path serving a legitimate client-facing action) but that also
// multiplexes in a staff-only action under the same method (e.g. a PATCH
// endpoint whose `action` field picks between a client's own form submit
// and a staff-only approve/reject). Middleware only sees path + method,
// not the body, so it can't tell those apart — this is the backstop.
export async function isStaffRequest(request) {
  const staffPincode = process.env.STAFF_PINCODE;
  if (!staffPincode) return false;
  const expected = await sha256Hex(staffPincode);
  return request.cookies.get(STAFF_COOKIE)?.value === expected;
}
