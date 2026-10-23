// lib/personalLogin.js
// Personal logins (migration 225): a staff member's own login code (an
// intern's, from the Staff page) instead of the shared staff PIN. Logging
// in with it sets a signed cookie naming them (staff_person); middleware.js
// and isStaffRequest accept it like the shared one, but only while they're
// active and on or before their last day (access_until), looked up live
// (cached 30 seconds), so switching them off ends it at once. Runs on the
// Edge too (middleware), so only Web Crypto here and Supabase imported
// lazily.

import { sha256Hex } from '@/lib/accountingAuth';

export const PERSONAL_COOKIE = 'staff_person';
const MAX_AGE_S = 60 * 60 * 24 * 30;

// The key the cookie is signed with: STAFF_SESSION_SECRET, else derived
// from the shared PIN (so changing the PIN also signs everyone out).
async function signingKey() {
  const { getEffectiveStaffPincode } = await import('@/lib/staffAuth');
  const secret = process.env.STAFF_SESSION_SECRET || `${(await getEffectiveStaffPincode()) || ''}:personal-login`;
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function hmac(text) {
  const sig = await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function personalSessionToken(staffId, now = Date.now()) {
  const exp = Math.floor(now / 1000) + MAX_AGE_S;
  return `${staffId}.${exp}.${await hmac(`${staffId}.${exp}`)}`;
}

export const PERSONAL_COOKIE_MAX_AGE = MAX_AGE_S;

const statusCache = new Map(); // staffId -> { ok, at }
const CACHE_MS = 30_000;

// Whether they may still use the app: active, and not past their last day.
async function staffStillAllowed(staffId) {
  const hit = statusCache.get(staffId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  let ok = false;
  try {
    const { supabase } = await import('@/lib/supabaseClient');
    const { data } = await supabase.from('staff').select('active, access_until, login_code_hash').eq('id', staffId).maybeSingle();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
    ok = !!data && data.active !== false && !!data.login_code_hash && !(data.access_until && String(data.access_until) < today);
  } catch {
    ok = hit?.ok || false;
  }
  statusCache.set(staffId, { ok, at: Date.now() });
  return ok;
}

// The staff id a cookie value was signed for (and hasn't expired), or null.
export async function verifyPersonalToken(token, now = Date.now()) {
  const m = typeof token === 'string' && token.match(/^([0-9a-f-]{36})\.(\d+)\.([0-9a-f]{64})$/);
  if (!m) return null;
  if (Number(m[2]) * 1000 < now) return null;
  return (await hmac(`${m[1]}.${m[2]}`)) === m[3] ? m[1] : null;
}

// The staff id a request's personal cookie stands for, while they may
// still use the app, or null.
export async function personalStaffId(request) {
  const staffId = await verifyPersonalToken(request.cookies.get(PERSONAL_COOKIE)?.value);
  return staffId && (await staffStillAllowed(staffId)) ? staffId : null;
}

// The staff member a login code belongs to, if it may log in now.
export async function staffForLoginCode(code) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) return null;
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
  const { data } = await supabaseAdmin.from('staff').select('id, full_name, active, access_until').eq('login_code_hash', await sha256Hex(`login:${clean}`)).maybeSingle();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  if (!data || data.active === false || (data.access_until && String(data.access_until) < today)) return null;
  return data;
}

// A new 6-digit login code for a staff member (shown once; only its hash
// is kept). Replaces any earlier one.
export async function newLoginCode(staffId) {
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
  for (let tries = 0; tries < 5; tries += 1) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const code = String(buf[0] % 1_000_000).padStart(6, '0');
    // Never the same as the shared staff PIN.
    const { getEffectiveStaffPincode } = await import('@/lib/staffAuth');
    if (code === (await getEffectiveStaffPincode())) continue;
    const { error } = await supabaseAdmin
      .from('staff')
      .update({ login_code_hash: await sha256Hex(`login:${code}`), login_code_set_at: new Date().toISOString() })
      .eq('id', staffId);
    if (!error) {
      statusCache.delete(staffId);
      return { code };
    }
    if (error.code !== '23505') return { error: error.message };
  }
  return { error: 'Could not make a unique code. Try again.' };
}

export async function removeLoginCode(staffId) {
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
  statusCache.delete(staffId);
  const { error } = await supabaseAdmin.from('staff').update({ login_code_hash: null, login_code_set_at: null }).eq('id', staffId);
  return error ? { error: error.message } : { ok: true };
}
