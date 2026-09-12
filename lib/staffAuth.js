// lib/staffAuth.js
// Shared helper for the staff-wide PIN gate (see middleware.js) — same
// basic keep-casual-visitors-out measure as lib/accountingAuth.js, not
// real per-user auth. One shared PIN for everyone on staff, checked
// against a cookie holding sha256(pincode). /accounting layers its own
// extra password on top of this for the owner/accountant-only pages —
// see lib/accountingAuth.js.

import { sha256Hex } from '@/lib/accountingAuth';

export const STAFF_COOKIE = 'staff_auth';

// The PIN itself can be overridden from the Accounting page (see
// app/api/accounting/staff-pincode/route.js) instead of only ever coming
// from the STAFF_PINCODE environment variable — clinic_settings.staff_pincode
// wins when set. This runs on every gated request (including in Edge
// middleware), so it's cached briefly in-process rather than hitting
// Supabase every time; a rotated PIN takes up to CACHE_MS to take effect
// everywhere, which is fine for a shared PIN that changes rarely (e.g.
// when someone leaves), not something that needs to be instant.
const CACHE_MS = 30_000;
let cached = null; // { value, expiresAt }

export async function getEffectiveStaffPincode() {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = process.env.STAFF_PINCODE || null;
  try {
    const { supabase } = await import('@/lib/supabaseClient');
    const { data } = await supabase.from('clinic_settings').select('staff_pincode').eq('id', true).maybeSingle();
    if (data?.staff_pincode) value = data.staff_pincode;
  } catch {
    // Supabase unreachable — fall back to whatever the env var gave us
    // rather than locking everyone out.
  }

  cached = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

// Re-checks the staff cookie from inside a route handler — for the rare
// route that's reachable without the PIN at the middleware level (a
// public path serving a legitimate client-facing action) but that also
// multiplexes in a staff-only action under the same method (e.g. a PATCH
// endpoint whose `action` field picks between a client's own form submit
// and a staff-only approve/reject). Middleware only sees path + method,
// not the body, so it can't tell those apart — this is the backstop.
export async function isStaffRequest(request) {
  const staffPincode = await getEffectiveStaffPincode();
  if (!staffPincode) return false;
  const expected = await sha256Hex(staffPincode);
  return request.cookies.get(STAFF_COOKIE)?.value === expected;
}
