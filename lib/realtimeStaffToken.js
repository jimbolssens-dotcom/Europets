// lib/realtimeStaffToken.js
// The token staff browsers use for live updates (Supabase Realtime).
//
// The anon key ships in every browser bundle, so since migration 190 it
// can't read the live tables. Staff pages instead connect with the access
// token of one Supabase Auth user whose app_metadata.app_role is 'staff'
// (only the service role can set app_metadata, so nobody can sign up into
// it). The table rules check that claim (public.is_staff_jwt()).
//
// The token is handed out by /api/realtime-token, which middleware.js keeps
// behind the staff login. One sign-in serves every staff browser for about
// an hour: the session is cached in realtime_tokens (migration 189, no
// policies, service role only) so we don't hit Supabase Auth's rate limits.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const EMAIL = 'realtime-staff@portal.epc.vet';
const CACHE_ID = 'staff';
// Hand out a cached token only while it has at least this long left; the
// browser asks again when it gets within 5 minutes of expiry.
const MIN_LEFT_MS = 15 * 60 * 1000;

// Derived from the service role key, so there's no extra secret to manage
// and it changes if that key is ever rotated (ensureUser then resets it).
function password() {
  return crypto
    .createHmac('sha256', process.env.SUPABASE_APP_SERVICE_ROLE_KEY || '')
    .update('realtime-staff-v1')
    .digest('hex');
}

function authClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_APP_URL,
    process.env.NEXT_PUBLIC_SUPABASE_APP_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

async function ensureUser() {
  const attrs = { password: password(), email_confirm: true, app_metadata: { app_role: 'staff' } };
  const { error } = await supabaseAdmin.auth.admin.createUser({ email: EMAIL, ...attrs });
  if (!error) return;
  // Already there (e.g. the service key was rotated): reset it.
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = (data?.users || []).find((u) => u.email === EMAIL);
  if (!user) throw new Error(`realtime staff user: ${error.message}`);
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, attrs);
  if (updateError) throw new Error(`realtime staff user: ${updateError.message}`);
}

async function signIn() {
  const client = authClient();
  let { data, error } = await client.auth.signInWithPassword({ email: EMAIL, password: password() });
  if (error) {
    await ensureUser();
    ({ data, error } = await client.auth.signInWithPassword({ email: EMAIL, password: password() }));
  }
  if (error || !data?.session) throw new Error(`realtime staff sign-in: ${error?.message || 'no session'}`);
  return data.session;
}

export async function getStaffRealtimeToken() {
  const { data: cached } = await supabaseAdmin
    .from('realtime_tokens')
    .select('access_token, expires_at')
    .eq('id', CACHE_ID)
    .maybeSingle();
  if (cached && new Date(cached.expires_at).getTime() - Date.now() > MIN_LEFT_MS) {
    return { access_token: cached.access_token, expires_at: cached.expires_at };
  }

  const session = await signIn();
  const expires_at = new Date(session.expires_at * 1000).toISOString();
  await supabaseAdmin
    .from('realtime_tokens')
    .upsert({ id: CACHE_ID, access_token: session.access_token, expires_at, updated_at: new Date().toISOString() });
  return { access_token: session.access_token, expires_at };
}
