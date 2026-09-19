// lib/clientAppAuth.js
// Real client-app authentication: a WhatsApp-delivered one-time code
// (see client_otp_codes / migration 128, app/api/client-app/auth/*)
// backing a signed, httpOnly session cookie — replacing the old "type a
// phone number on file, no verification" localStorage-remembers-a-choice
// scheme (see the SECURITY NOTE this replaces in app/client-app/layout.js).
//
// Uses the Web Crypto API (not Node's `crypto` module) so the same code
// runs in both Edge middleware and API routes — same reasoning as
// lib/accountingAuth.js's sha256Hex, reused here.
//
// Tokens are stateless and HMAC-signed with CLIENT_SESSION_SECRET (a
// dedicated env var — never reuse STAFF_PINCODE/ACCOUNTING_PASSWORD,
// which are short, guessable shared passphrases, not signing keys). Two
// kinds share the same signing helper, distinguished by `purpose` so one
// can never be replayed as the other:
//   - "session": long-lived (SESSION_TTL_MS), issued once a code is
//     verified (and, when a phone matches more than one client, once
//     that client is picked) — this is what proves "you are this client"
//     to every client-app API route.
//   - "verified-phone": short-lived (VERIFIED_PHONE_TTL_MS), the bridge
//     between "this phone's code checked out" and "here's the specific
//     client to log in as" when one phone matches multiple client
//     records — see POST /api/client-app/auth/select-account.
//
// clients, client_phones, and patients have RLS enabled elsewhere in this
// app (migrations/093_clients_patients_rls.sql); client_otp_codes does
// not (see migration 128) — there's nothing in it worth protecting beyond
// the hash + short expiry already does, and the admin client bypasses RLS
// for it either way.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { clientIdsWithPhoneLike } from '@/lib/phoneMatch';
export { normalizePhoneDigits } from '@/lib/clientPhoneDigits';

export const CLIENT_SESSION_COOKIE = 'client_app_session';
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — this is a "stay logged in" app, not a bank
export const VERIFIED_PHONE_TTL_MS = 5 * 60 * 1000; // 5 minutes to pick an account after a code checks out
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateOtpCode() {
  // 6 digits, zero-padded — crypto.getRandomValues rather than Math.random
  // since this gates access to someone's medical/financial records.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

async function hmacHex(message) {
  const secret = process.env.CLIENT_SESSION_SECRET;
  if (!secret) {
    // Loud and immediate rather than silently signing with a placeholder
    // (see lib/supabaseAdmin.js for why that pattern is worse — this one
    // guards a login, not just a write, so a placeholder secret would let
    // anyone forge a session for any client).
    throw new Error('CLIENT_SESSION_SECRET is not configured');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function signToken(purpose, payload, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  const body = `${purpose}.${expiresAt}.${JSON.stringify(payload)}`;
  const bodyB64 = Buffer.from(body, 'utf8').toString('base64url');
  const sig = await hmacHex(bodyB64);
  return `${bodyB64}.${sig}`;
}

async function verifyToken(purpose, token) {
  if (!token || typeof token !== 'string') return null;
  const [bodyB64, sig] = token.split('.');
  if (!bodyB64 || !sig) return null;
  const expectedSig = await hmacHex(bodyB64);
  if (sig !== expectedSig) return null;

  let body;
  try {
    body = Buffer.from(bodyB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const [tokenPurpose, expiresAtStr, ...rest] = body.split('.');
  if (tokenPurpose !== purpose) return null;
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || expiresAt < Date.now()) return null;

  try {
    return JSON.parse(rest.join('.'));
  } catch {
    return null;
  }
}

export async function signSessionToken(clientId) {
  return signToken('session', { clientId }, SESSION_TTL_MS);
}

export async function verifySessionToken(token) {
  const payload = await verifyToken('session', token);
  return payload?.clientId ? payload.clientId : null;
}

export async function signVerifiedPhoneToken(phone) {
  return signToken('verified-phone', { phone }, VERIFIED_PHONE_TTL_MS);
}

export async function verifyVerifiedPhoneToken(token) {
  const payload = await verifyToken('verified-phone', token);
  return payload?.phone || null;
}

// Reads and verifies the session cookie from an API route — the one check
// every client-app-facing route needs before trusting a client_id it's
// handed (see the SECURITY NOTE in app/client-app/layout.js this whole
// file exists to close). Returns the verified clientId, or null if there
// is no valid session (expired, missing, tampered).
export async function getClientSession(request) {
  const token = request.cookies.get(CLIENT_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// Same lookup GET /api/clients?phone= already does (see clients.phone —
// synced to whichever client_phones row is flagged is_whatsapp — or any
// other number on file), pulled out here so the OTP endpoints don't
// duplicate it. Returns the matching client rows (id + full_name +
// client_number only — this runs before login, so nothing more should be
// exposed yet).
export async function findClientsByPhone(phoneDigits) {
  const extraIds = await clientIdsWithPhoneLike(supabaseAdmin, `%${phoneDigits}%`);
  let query = supabaseAdmin.from('clients').select('id, full_name, client_number').order('full_name');
  query =
    extraIds.length > 0
      ? query.or(`phone.ilike.%${phoneDigits}%,id.in.(${extraIds.join(',')})`)
      : query.ilike('phone', `%${phoneDigits}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function storeOtpCode(phoneDigits, code) {
  const codeHash = await sha256Hex(code);
  const { error } = await supabaseAdmin.from('client_otp_codes').insert([
    {
      phone: phoneDigits,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    },
  ]);
  if (error) throw error;
}

// Checks `code` against the most recent unconsumed code for this phone,
// consuming it (so it can't be replayed) whichever way this comes out.
// Returns { ok: true } or { ok: false, reason: 'expired' | 'wrong' | 'too_many_attempts' }.
export async function verifyOtpCode(phoneDigits, code) {
  const { data: rows, error } = await supabaseAdmin
    .from('client_otp_codes')
    .select('*')
    .eq('phone', phoneDigits)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'expired' };

  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    await supabaseAdmin.from('client_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
    return { ok: false, reason: 'too_many_attempts' };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  const codeHash = await sha256Hex(code);
  if (codeHash !== row.code_hash) {
    await supabaseAdmin.from('client_otp_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false, reason: 'wrong' };
  }

  await supabaseAdmin.from('client_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
  return { ok: true };
}
