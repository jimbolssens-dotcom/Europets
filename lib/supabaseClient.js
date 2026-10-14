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
// On the server (API routes, server components) this uses the service role
// key, so the anon key can be locked down to what the browser genuinely
// needs (realtime and clinic_settings) without breaking any server read.
// SUPABASE_APP_SERVICE_ROLE_KEY isn't a NEXT_PUBLIC_ var, so Next.js never
// inlines it into a browser bundle: there it's undefined and the anon key
// is used, exactly as before.
const serverKey = typeof window === 'undefined' ? process.env.SUPABASE_APP_SERVICE_ROLE_KEY : undefined;
const supabaseKey = serverKey || process.env.NEXT_PUBLIC_SUPABASE_APP_KEY || 'placeholder-anon-key';

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
//
// In the browser, staff pages connect with the staff token from
// /api/realtime-token (see lib/realtimeStaffToken.js), since the anon key
// can't read the live tables (migration 190). Realtime asks for it on
// connect and on every heartbeat, so it's cached here until 5 minutes
// before expiry. Owner-facing pages (client app, portal) and /login have
// no staff cookie, so they skip it and stay on the anon key.
const isBrowser = typeof window !== 'undefined';
const NO_STAFF_TOKEN = /^\/(client-app|portal|login|intake|consent|review)(\/|$)/;
let staffToken = null;
let staffTokenRequest = null;

function staffRealtimeToken() {
  if (NO_STAFF_TOKEN.test(window.location.pathname)) return Promise.resolve(null);
  if (staffToken && staffToken.expiresAt - Date.now() > 5 * 60 * 1000) return Promise.resolve(staffToken.token);
  if (!staffTokenRequest) {
    staffTokenRequest = fetch('/api/realtime-token', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok && (res.headers.get('content-type') || '').includes('json') ? res.json() : null))
      .then((data) => {
        if (data?.access_token) staffToken = { token: data.access_token, expiresAt: new Date(data.expires_at).getTime() };
      })
      .catch(() => {})
      .then(() => {
        staffTokenRequest = null;
        return staffToken && staffToken.expiresAt > Date.now() ? staffToken.token : null;
      });
  }
  return staffTokenRequest;
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
  ...(isBrowser ? { accessToken: staffRealtimeToken } : {}),
});
