// lib/supabaseServerAdmin.js
// Server-only Supabase client for the shared clinic backend, using the
// service-role key — bypasses Row Level Security entirely, unlike
// lib/supabaseServer.js's key. Import this ONLY from server-side code
// (Route Handlers), same rule as supabaseServer.js.
//
// invoices, invoice_payments, nomod_payment_links, and review_requests
// have RLS enabled on the shared project (see migrations/ in the app
// folder) so the regular key can no longer write to them — every
// insert/update/delete this site makes on those tables goes through this
// client instead. Every read stays on the regular supabaseServer client.
//
// Set SUPABASE_SERVICE_ROLE_KEY (from the shared project's own
// Settings -> API page — "Secret keys" section, or "service_role" under
// "Project API keys" on older projects) as this site's own env var —
// separate from the app folder's SUPABASE_APP_SERVICE_ROLE_KEY name, even
// though both point at the same underlying Supabase project.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

export const supabaseServerAdmin = createClient(supabaseUrl, serviceRoleKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
