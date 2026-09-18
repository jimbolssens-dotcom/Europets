// POST /api/client-app/auth/verify-code  -> { phone, code }
// Second half of client-app login (see request-code). On a correct code:
// exactly one client on file for this number logs straight in (session
// cookie set here); more than one returns the list plus a short-lived
// verifiedPhoneToken for POST .../select-account to finish with.

import { NextResponse } from 'next/server';
import {
  normalizePhoneDigits,
  findClientsByPhone,
  verifyOtpCode,
  signSessionToken,
  signVerifiedPhoneToken,
  CLIENT_SESSION_COOKIE,
  SESSION_TTL_MS,
} from '@/lib/clientAppAuth';
import { checkRateLimit, recordFailedAttempt, clearAttempts, getClientKey } from '@/lib/loginRateLimit';

const REASON_MESSAGE = {
  wrong: 'That code is incorrect.',
  expired: 'That code has expired — request a new one.',
  too_many_attempts: 'Too many incorrect attempts — request a new code.',
};

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const phoneDigits = normalizePhoneDigits(body.phone);
  const code = String(body.code || '').trim();
  if (phoneDigits.length < 12 || !code) {
    return NextResponse.json({ error: 'Enter the code you received.' }, { status: 400 });
  }

  const ipKey = `otp-verify-ip:${getClientKey(request)}`;
  const ipLimit = checkRateLimit(ipKey);
  if (ipLimit.blocked) {
    return NextResponse.json({ error: 'Too many attempts — please try again later.' }, { status: 429 });
  }

  const result = await verifyOtpCode(phoneDigits, code);
  if (!result.ok) {
    recordFailedAttempt(ipKey);
    return NextResponse.json({ error: REASON_MESSAGE[result.reason] || 'Invalid code.' }, { status: 401 });
  }
  clearAttempts(ipKey);

  const matches = await findClientsByPhone(phoneDigits);
  if (matches.length === 0) {
    // The code was real, but every client that had this number is gone
    // now (deleted in the few minutes since the code was requested).
    return NextResponse.json({ error: "We couldn't find that number on file — please contact the clinic." }, { status: 404 });
  }

  if (matches.length > 1) {
    const verifiedPhoneToken = await signVerifiedPhoneToken(phoneDigits);
    return NextResponse.json({ matches, verifiedPhoneToken });
  }

  const clientId = matches[0].id;
  const sessionToken = await signSessionToken(clientId);
  const response = NextResponse.json({ clientId });
  response.cookies.set(CLIENT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return response;
}
