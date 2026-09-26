// app/api/login/route.js
// POST   -> check the staff PIN or (if enabled) a WhatsApp OTP code, set
//           the staff_auth cookie on success
// DELETE -> log out (clear the cookie)
//
// Deliberately its own top-level path (not under /api/anything-else/) so
// middleware.js's staff-wide gate doesn't also block logging in. Rate-
// limited (see lib/loginRateLimit.js) since a short shared PIN — or a
// guessed OTP — is otherwise easy to brute-force.
//
// The PIN branch (`{ pincode }`) never goes away even once
// STAFF_LOGIN_OTP_ENABLED is on — see lib/staffAuth.js's isStaffOtpEnabled
// comment for why: it's the fallback if WhatsApp sending ever breaks.
// The OTP branch (`{ code }`) only exists once that flag is on; the
// request-code step that sends the code lives at /api/login/request-code.

import { NextResponse } from 'next/server';
import { STAFF_COOKIE, getEffectiveStaffPincode, isStaffOtpEnabled, verifyStaffOtpCode } from '@/lib/staffAuth';
import { sha256Hex } from '@/lib/accountingAuth';
import { checkRateLimit, recordFailedAttempt, clearAttempts, getClientKey } from '@/lib/loginRateLimit';

function setStaffCookie(token) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return res;
}

export async function POST(request) {
  const clientKey = `staff:${getClientKey(request)}`;
  const rateLimit = checkRateLimit(clientKey);
  if (rateLimit.blocked) {
    return NextResponse.json(
      { error: `Too many attempts — try again in ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minute(s)` },
      { status: 429 }
    );
  }

  const body = await request.json();

  if (isStaffOtpEnabled() && body.code) {
    let result;
    try {
      result = await verifyStaffOtpCode(body.code);
    } catch {
      return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 });
    }
    if (!result.ok) {
      recordFailedAttempt(clientKey);
      const message =
        result.reason === 'too_many_attempts'
          ? 'Too many wrong attempts for that code — request a new one.'
          : result.reason === 'expired'
            ? 'That code has expired — request a new one.'
            : 'Incorrect code';
      return NextResponse.json({ error: message }, { status: 401 });
    }
    clearAttempts(clientKey);
    // The cookie still holds sha256(pincode) everywhere else in the app
    // (isStaffRequest, etc.) — an OTP login earns the exact same cookie
    // value as a PIN login so nothing downstream needs to know which way
    // someone got in.
    const expected = await getEffectiveStaffPincode();
    if (!expected) {
      return NextResponse.json({ error: 'Staff access is not configured' }, { status: 503 });
    }
    return setStaffCookie(await sha256Hex(expected));
  }

  const { pincode } = body;
  const expected = await getEffectiveStaffPincode();

  if (!expected) {
    return NextResponse.json({ error: 'Staff access is not configured' }, { status: 503 });
  }
  if (pincode !== expected) {
    recordFailedAttempt(clientKey);
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
  }

  clearAttempts(clientKey);
  return setStaffCookie(await sha256Hex(expected));
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(STAFF_COOKIE);
  return res;
}
