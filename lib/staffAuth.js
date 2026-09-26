// lib/staffAuth.js
// Shared helper for the staff-wide gate (see middleware.js) — still not
// real per-user auth (everyone on staff ends up with the same cookie
// either way), but now two ways to earn that cookie:
//   1. The original shared PIN, checked against a cookie holding
//      sha256(pincode) — kept as a permanent fallback (see
//      STAFF_LOGIN_OTP_ENABLED below for why it's never removed).
//   2. A 6-digit code sent over WhatsApp to the clinic's own number
//      (see sendStaffLoginOtp/verifyStaffOtpCode below) — only clients
//      never have access to that number, so possession of it is a real
//      factor, unlike a PIN that's just memorized and can leak/get
//      guessed (4 digits is only 10,000 combinations).
// /accounting layers its own extra password on top of whichever of these
// got you in — see lib/accountingAuth.js.

import { sha256Hex } from '@/lib/accountingAuth';

export const STAFF_COOKIE = 'staff_auth';

// Off by default — flip STAFF_LOGIN_OTP_ENABLED="true" (in Vercel's env
// vars, not here) once the clinic's own WhatsApp number is confirmed
// working and everyone on staff knows to expect a code there instead of
// typing the old PIN. Until then this whole feature is inert: the code
// is deployed and testable, but /login keeps behaving exactly as before.
// The old PIN form/route is never removed — it's the fallback if WhatsApp
// sending ever breaks (Meta outage, misconfigured token, etc.), so staff
// are never locked out of their own clinic by a WhatsApp problem.
export function isStaffOtpEnabled() {
  return process.env.STAFF_LOGIN_OTP_ENABLED === 'true';
}

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export function generateStaffOtpCode() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

// Sends a fresh code to the clinic's own WhatsApp number (
// STAFF_LOGIN_OTP_PHONE — digits only, e.g. "971508606857") using the
// exact same Meta "Authentication" template already approved and working
// for the client app's login codes (see lib/metaWhatsapp.js) — nothing
// new to set up in Meta's WhatsApp Manager for this.
//
// supabaseAdmin/metaWhatsapp are imported dynamically (not at module
// top-level) for the same reason getEffectiveStaffPincode below imports
// supabaseClient dynamically: this file is also loaded by middleware.js,
// which runs on the Edge runtime — keeping those imports out of this
// module's top level means middleware's bundle never pulls them in, since
// it only ever calls getEffectiveStaffPincode/STAFF_COOKIE, never these.
export async function sendStaffLoginOtp() {
  const phone = process.env.STAFF_LOGIN_OTP_PHONE;
  if (!phone) throw new Error('STAFF_LOGIN_OTP_PHONE is not configured');

  const { sendWhatsAppOtp, isWhatsAppConfigured } = await import('@/lib/metaWhatsapp');
  if (!isWhatsAppConfigured()) throw new Error('WhatsApp is not configured (META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID)');

  const code = generateStaffOtpCode();
  const codeHash = await sha256Hex(code);
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
  const { error } = await supabaseAdmin.from('staff_otp_codes').insert([
    { code_hash: codeHash, expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString() },
  ]);
  if (error) throw error;

  await sendWhatsAppOtp(phone, code);
}

// Checks `code` against the most recent unconsumed staff code, consuming
// it either way (so it can't be replayed) — same shape as
// lib/clientAppAuth.js's verifyOtpCode, just with no phone to key on
// since there's only ever the one destination number.
export async function verifyStaffOtpCode(code) {
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
  const { data: rows, error } = await supabaseAdmin
    .from('staff_otp_codes')
    .select('*')
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'expired' };

  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    await supabaseAdmin.from('staff_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
    return { ok: false, reason: 'too_many_attempts' };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  const codeHash = await sha256Hex(code);
  if (codeHash !== row.code_hash) {
    await supabaseAdmin.from('staff_otp_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false, reason: 'wrong' };
  }

  await supabaseAdmin.from('staff_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
  return { ok: true };
}

// The PIN itself can be overridden from the Accounting page (see
// app/api/accounting/staff-pincode/route.js) instead of only ever coming
// from the STAFF_PINCODE environment variable — clinic_settings.staff_pincode
// wins when set. This runs on every gated request (including in Edge
// middleware), so it's cached briefly in-process rather than hitting
// Supabase every time; a rotated PIN takes up to CACHE_MS to take effect
// everywhere, which is fine for a shared PIN that changes rarely (e.g.
// when someone leaves), not something that needs to be instant.
const CACHE_MS = 30_000;
let cached = null; // { value, expiresAt }

export async function getEffectiveStaffPincode() {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = process.env.STAFF_PINCODE || null;
  try {
    const { supabase } = await import('@/lib/supabaseClient');
    const { data } = await supabase.from('clinic_settings').select('staff_pincode').eq('id', true).maybeSingle();
    if (data?.staff_pincode) value = data.staff_pincode;
  } catch {
    // Supabase unreachable — fall back to whatever the env var gave us
    // rather than locking everyone out.
  }

  cached = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

// Re-checks the staff cookie from inside a route handler — for the rare
// route that's reachable without the PIN at the middleware level (a
// public path serving a legitimate client-facing action) but that also
// multiplexes in a staff-only action under the same method (e.g. a PATCH
// endpoint whose `action` field picks between a client's own form submit
// and a staff-only approve/reject). Middleware only sees path + method,
// not the body, so it can't tell those apart — this is the backstop.
export async function isStaffRequest(request) {
  const staffPincode = await getEffectiveStaffPincode();
  if (!staffPincode) return false;
  const expected = await sha256Hex(staffPincode);
  return request.cookies.get(STAFF_COOKIE)?.value === expected;
}
