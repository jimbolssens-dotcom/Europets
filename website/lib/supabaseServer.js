// lib/supabaseServer.js
// Server-only Supabase client for the shared clinic backend (same project
// as the staff app). Never import this from a 'use client' file or a
// component that could end up in the browser bundle — see the warning in
// .env.local.example for why: RLS is off project-wide, so this key can
// read/write every table, and it must never reach a visitor's browser.
// Pages here only ever get data through this site's own Route Handlers
// (app/api/**), which pick the specific safe fields to return — the same
// boundary discipline the staff app's own API routes already follow.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
// Prefer the service role key (server-only, set on this Vercel project) so
// the shared project's anon key can be locked down to what the staff
// app's browser pages need. Falls back to SUPABASE_KEY where it isn't set.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'placeholder-key';

export const supabaseServer = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
