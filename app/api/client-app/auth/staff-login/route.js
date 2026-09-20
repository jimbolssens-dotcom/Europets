// POST /api/client-app/auth/staff-login -> { phone }
// Staff-only bypass for the client-app login: skips the WhatsApp code
// entirely and issues a session cookie straight away. Safe specifically
// because it requires an already-valid staff PIN cookie — the same
// backstop pattern as isStaffRequest's other callers (see lib/staffAuth.js)
// — and because /client-app itself is currently reachable by nobody else
// anyway (not in middleware.js's PUBLIC_PATTERNS yet). Exists so staff can
// keep testing/demoing the client app while the real WhatsApp OTP send
// isn't live yet (no approved template / no production number — see
// app/client-app/layout.js's SECURITY NOTE). Remove this route, or gate it
// further, before /client-app ever becomes public.

import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import {
  normalizePhoneDigits,
  findClientsByPhone,
  signSessionToken,
  signVerifiedPhoneToken,
  CLIENT_SESSION_COOKIE,
  SESSION_TTL_MS,
} from '@/lib/clientAppAuth';

export async function POST(request) {
  if (!(await isStaffRequest(request))) {
    return NextResponse.json({ error: 'Staff login required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const phoneDigits = normalizePhoneDigits(body.phone);
  if (phoneDigits.length < 12) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }

  const matches = await findClientsByPhone(phoneDigits);
  if (matches.length === 0) {
    return NextResponse.json({ error: "We couldn't find that number on file." }, { status: 404 });
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
