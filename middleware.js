// middleware.js
// Gates /accounting (and the API routes only it uses) behind a shared
// password — see lib/accountingAuth.js for why this is a basic gate, not
// real security. /api/accounting-login is deliberately its own top-level
// path, outside /api/accounting/, so logging in isn't itself blocked by
// this same check.

import { NextResponse } from 'next/server';
import { ACCOUNTING_COOKIE, sha256Hex } from '@/lib/accountingAuth';

export async function middleware(request) {
  const password = process.env.ACCOUNTING_PASSWORD;
  if (!password) {
    return new NextResponse(
      'Accounting access is not configured — set the ACCOUNTING_PASSWORD environment variable.',
      { status: 503 }
    );
  }

  const expected = await sha256Hex(password);
  const cookie = request.cookies.get(ACCOUNTING_COOKIE)?.value;
  if (cookie === expected) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Accounting access requires logging in at /accounting-login' },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/accounting-login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/accounting/:path*', '/api/accounting/:path*', '/api/expenses/:path*'],
};
