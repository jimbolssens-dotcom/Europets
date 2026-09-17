// lib/accountingAuth.js
// Shared helpers for the /accounting section's password gate (see
// middleware.js). This app has no real auth system — RLS is disabled on
// every table (migrations/003_disable_rls.sql) and the Supabase anon key
// ships in the client bundle — so this is a basic keep-casual-staff-out
// measure for the owner/accountant-only pages, not a real security
// boundary. Uses the Web Crypto API (not Node's `crypto` module) so the
// same code runs in both Edge middleware and API routes.

export const ACCOUNTING_COOKIE = 'accounting_auth';

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Re-checks the accounting cookie from inside a route handler — for the
// rare route that's reachable without the accounting password at the
// middleware level (e.g. the general, PIN-only invoice payments routes)
// but that also needs to block one accounting-consequential action within
// it (removing a donation-tagged payment) without gating the whole route.
// Mirrors isStaffRequest in lib/staffAuth.js.
export async function isAccountingRequest(request) {
  const accountingPassword = process.env.ACCOUNTING_PASSWORD;
  if (!accountingPassword) return false;
  const expected = await sha256Hex(accountingPassword);
  return request.cookies.get(ACCOUNTING_COOKIE)?.value === expected;
}
