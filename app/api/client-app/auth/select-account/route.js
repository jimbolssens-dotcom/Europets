// POST /api/client-app/auth/select-account  -> { verifiedPhoneToken, clientId }
// Finishes login when one phone matched more than one client record (see
// verify-code) — picks which client to log in as. Re-checks that clientId
// actually has the verified phone on file, so the verifiedPhoneToken (proof
// of "this phone's code checked out", not "log in as anyone you like")
// can't be used to log in as an unrelated client by just changing the id.

import { NextResponse } from 'next/server';
import {
  verifyVerifiedPhoneToken,
  findClientsByPhone,
  signSessionToken,
  CLIENT_SESSION_COOKIE,
  SESSION_TTL_MS,
} from '@/lib/clientAppAuth';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { verifiedPhoneToken, clientId } = body;

  const phoneDigits = await verifyVerifiedPhoneToken(verifiedPhoneToken);
  if (!phoneDigits) {
    return NextResponse.json({ error: 'That login attempt expired — please start again.' }, { status: 401 });
  }
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  const matches = await findClientsByPhone(phoneDigits);
  if (!matches.some((c) => c.id === clientId)) {
    return NextResponse.json({ error: 'That account is not on file for this phone number.' }, { status: 403 });
  }

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
