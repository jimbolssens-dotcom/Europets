// lib/supabaseClient.js
// Shared Supabase connection used by all API routes.
// Create a free Supabase project at supabase.com, run schema.sql
// in its SQL editor, then drop your project URL + publishable key into
// .env.local:
//
//   NEXT_PUBLIC_SUPABASE_APP_URL=https://your-project.supabase.co
//   NEXT_PUBLIC_SUPABASE_APP_KEY=your-publishable-key
//
// Deliberately NOT named NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY: Vercel's
// Supabase marketplace integration auto-injects env vars under those
// exact names for whatever project it auto-provisioned, which silently
// overrides a different, manually-configured Supabase project. These
// app-specific names can't collide with that.

import { createClient } from '@supabase/supabase-js';

// Fall back to placeholder values so `next build`/`next dev` don't crash
// before .env.local is set up. Any real request will simply fail against
// the placeholder host until real credentials are provided.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_APP_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_APP_KEY || 'placeholder-anon-key';

// Next.js's App Router patches the global fetch() to cache GET requests by
// default — including ones made internally by supabase-js's REST client,
// not just ones this app calls directly. `export const dynamic =
// 'force-dynamic'` on a route is supposed to opt out of that, but in
// practice (confirmed here: a PDF route kept serving stale line items
// despite that) it doesn't reliably reach fetches made from a client that
// was constructed once at module load rather than per-request. Passing an
// explicit fetch wrapper that always sets `cache: 'no-store'` is the
// unambiguous fix — every request this client makes, anywhere in the app,
// always hits Supabase fresh.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
