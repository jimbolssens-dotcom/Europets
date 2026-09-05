// middleware.js
// Two layers of the same basic shared-code gate pattern (see
// lib/staffAuth.js and lib/accountingAuth.js for why this is a keep-
// casual-visitors-out measure, not real per-user auth):
//
// 1. A staff-wide gate in front of nearly everything — the whole
//    app/(admin) section (which has no shared URL prefix, since it's a
//    route group) plus app/mobile. A small allowlist stays open with no
//    PIN at all: the client-facing app/portal pages and the handful of
//    API routes they call (see PUBLIC_PATTERNS below), plus /login
//    itself and its own API route.
// 2. The pre-existing extra /accounting password on top of that, for the
//    owner/accountant-only pages — unchanged, except it now also implies
//    the staff PIN (you need both, checked in that order).
//
// One deliberate carve-out survives from before: POST /api/expenses and
// POST /api/expenses/scan skip the extra accounting password (see app/
// mobile/scan-receipt) — they still require the general staff PIN like
// everything else under app/mobile now does.

import { NextResponse } from 'next/server';
import { STAFF_COOKIE } from '@/lib/staffAuth';
import { ACCOUNTING_COOKIE, sha256Hex } from '@/lib/accountingAuth';

// Path patterns reachable with no login at all — the public client portal
// and exactly the API routes its pages call (see their fetch() calls),
// nothing broader. Everything else falls through to the staff gate below.
const PUBLIC_PATTERNS = [
  /^\/login$/,
  /^\/api\/login$/,
  /^\/portal(\/.*)?$/,
  /^\/api\/new-client-qr$/,
  /^\/api\/intake-requests\/[^/]+$/, // by id only — the public form's own GET/PATCH
  /^\/api\/hospitalizations\/[^/]+$/, // by id only — the client portal's status read
  /^\/api\/hospitalizations\/[^/]+\/notes$/, // by id only, not /notes/[noteId]
  /^\/api\/hospitalizations\/[^/]+\/request-update$/,
  /^\/api\/booking-availability(\/.*)?$/,
];

function isPublicPath(pathname, method) {
  if (pathname === '/api/staff' && method === 'GET') return true; // vet picker on the booking form
  return PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname, request.method)) {
    return NextResponse.next();
  }

  const staffPincode = process.env.STAFF_PINCODE;
  if (!staffPincode) {
    return new NextResponse(
      'Staff access is not configured — set the STAFF_PINCODE environment variable.',
      { status: 503 }
    );
  }

  const staffExpected = await sha256Hex(staffPincode);
  const staffCookie = request.cookies.get(STAFF_COOKIE)?.value;
  if (staffCookie !== staffExpected) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Staff login required at /login' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Past the general staff gate — /accounting (and the API routes only it
  // uses) needs its own extra password on top, same as before.
  const isOpenExpenseWrite =
    request.method === 'POST' && (pathname === '/api/expenses' || pathname === '/api/expenses/scan');
  // Boundary-aware: startsWith alone would also catch the sibling paths
  // /accounting-login and /api/accounting-login, which must stay reachable
  // with just the general staff login (see the login-deadlock this would
  // otherwise cause — you could never reach the form that sets the
  // accounting cookie in the first place).
  const isUnderPath = (base) => pathname === base || pathname.startsWith(`${base}/`);
  const needsAccountingPassword =
    !isOpenExpenseWrite &&
    (isUnderPath('/accounting') || isUnderPath('/api/accounting') || isUnderPath('/api/expenses'));

  if (needsAccountingPassword) {
    const accountingPassword = process.env.ACCOUNTING_PASSWORD;
    if (!accountingPassword) {
      return new NextResponse(
        'Accounting access is not configured — set the ACCOUNTING_PASSWORD environment variable.',
        { status: 503 }
      );
    }
    const accountingExpected = await sha256Hex(accountingPassword);
    const accountingCookie = request.cookies.get(ACCOUNTING_COOKIE)?.value;
    if (accountingCookie !== accountingExpected) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Accounting access requires logging in at /accounting-login' },
          { status: 401 }
        );
      }
      const loginUrl = new URL('/accounting-login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|icon.png).*)'],
};
