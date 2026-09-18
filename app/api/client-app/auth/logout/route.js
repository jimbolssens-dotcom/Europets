// POST /api/client-app/auth/logout -> clears the session cookie.
// Needs a route rather than a client-side localStorage.clear() now that
// the session lives in an httpOnly cookie JS can't touch directly.

import { NextResponse } from 'next/server';
import { CLIENT_SESSION_COOKIE } from '@/lib/clientAppAuth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CLIENT_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
