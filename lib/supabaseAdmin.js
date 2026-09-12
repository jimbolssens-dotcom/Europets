// lib/supabaseAdmin.js
// Server-only Supabase client using the service-role key — bypasses Row
// Level Security entirely, unlike lib/supabaseClient.js's publishable-key
// client. Import this ONLY from server-side code (API routes); never from
// a 'use client' component, since the service-role key must never reach
// the browser bundle.
//
// clients, client_phones, and patients have RLS enabled (see migrations/
// 093_clients_patients_rls.sql) so the publishable key can no longer
// write to them — every insert/update/delete on those three tables goes
// through this client instead. Every read, and every other table's reads
// and writes, is unaffected and stays on the regular supabase client.
//
// Deliberately NOT named SUPABASE_SERVICE_ROLE_KEY: same reason as
// NEXT_PUBLIC_SUPABASE_APP_URL/_APP_KEY in lib/supabaseClient.js —
// Vercel's Supabase marketplace integration auto-injects a variable
// under that exact name for whatever project it auto-provisioned, and
// that's a different, unused Supabase project from this app's real one.
// Set SUPABASE_APP_SERVICE_ROLE_KEY instead, from the *real* project's
// Settings -> API page ("Secret keys" section, or "service_role" under
// "Project API keys" on older projects) — never the auto-injected one.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_APP_URL || 'https://placeholder.supabase.co';
const serviceRoleKey = process.env.SUPABASE_APP_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
