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
