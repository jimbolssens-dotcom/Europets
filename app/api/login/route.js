// app/api/login/route.js
// POST   -> check the staff PIN, set the staff_auth cookie on success
// DELETE -> log out (clear the cookie)
//
// Deliberately its own top-level path (not under /api/anything-else/) so
// middleware.js's staff-wide gate doesn't also block logging in. Rate-
// limited (see lib/loginRateLimit.js) since a short shared PIN is
// otherwise easy to brute-force.

import { NextResponse } from 'next/server';
import { STAFF_COOKIE } from '@/lib/staffAuth';
import { sha256Hex } from '@/lib/accountingAuth';
import { checkRateLimit, recordFailedAttempt, clearAttempts, getClientKey } from '@/lib/loginRateLimit';

export async function POST(request) {
  const clientKey = `staff:${getClientKey(request)}`;
  const rateLimit = checkRateLimit(clientKey);
  if (rateLimit.blocked) {
    return NextResponse.json(
      { error: `Too many attempts — try again in ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minute(s)` },
      { status: 429 }
    );
  }

  const { pincode } = await request.json();
  const expected = process.env.STAFF_PINCODE;

  if (!expected) {
    return NextResponse.json({ error: 'Staff access is not configured' }, { status: 503 });
  }
  if (pincode !== expected) {
    recordFailedAttempt(clientKey);
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
  }

  clearAttempts(clientKey);
  const token = await sha256Hex(expected);
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

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(STAFF_COOKIE);
  return res;
}
