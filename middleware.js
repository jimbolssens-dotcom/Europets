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
import { STAFF_COOKIE, getEffectiveStaffPincode } from '@/lib/staffAuth';
import { ACCOUNTING_COOKIE, sha256Hex } from '@/lib/accountingAuth';

// Path patterns reachable with no login at all — the public client portal
// and exactly the API routes its pages call (see their fetch() calls),
// nothing broader. Everything else falls through to the staff gate below.
const PUBLIC_PATTERNS = [
  /^\/login$/,
  /^\/api\/login$/,
  /^\/portal(\/.*)?$/,
  /^\/api\/new-client-qr$/,
  /^\/api\/intake-requests\/[^/]+$/, // by id only — the public form's own GET/PATCH (PATCH's staff-only actions re-check the cookie themselves — see isStaffRequest in that route)
  /^\/api\/consent-form-requests\/[^/]+$/, // by id only — the remote-signing page's own GET/POST
  /^\/api\/hospitalizations\/[^/]+\/request-update$/,
  /^\/api\/booking-availability(\/.*)?$/,
  /^\/api\/app-version$/, // polled by AppVersionWatcher on every page, staff and portal alike
  /^\/api\/whatsapp\/webhook$/, // Meta's own verification + event delivery — can't carry a staff cookie; verified via its own signature header instead (see the route)
  // Report/invoice PDFs staff link directly to a client via WhatsApp/email
  // (see ReportShareActions and the invoice/consult pages) — these need to
  // open for the client with no login, same reasoning as the rest of this
  // list. Each still only exposes the one record its UUID names, nothing
  // broader. (This carve-out was missing when the staff gate below was
  // first added, silently breaking every one of these "send to owner"
  // buttons — see migration/PR history around 2026-09-07.)
  /^\/api\/invoices\/[^/]+\/tax-invoice-pdf$/,
  /^\/api\/surgical-reports\/[^/]+\/report-pdf$/,
  /^\/api\/ultrasound-reports\/[^/]+\/report-pdf$/,
  /^\/api\/xray-reports\/[^/]+\/report-pdf$/,
  /^\/api\/dental-reports\/[^/]+\/report-pdf$/,
  /^\/api\/visits\/[^/]+\/report-pdf$/,
  /^\/api\/visits\/[^/]+\/test-report-pdf$/,
  /^\/api\/hospitalizations\/[^/]+\/test-report-pdf$/,
  /^\/api\/hospitalizations\/[^/]+\/summary-pdf$/,
  /^\/api\/clients\/[^/]+\/statement-pdf$/,
  /^\/api\/proforma-invoices\/[^/]+\/quote-pdf$/,
  // The client-app UI itself, plus its login flow (request/verify code,
  // pick an account, log out, check the session) — see app/client-app/
  // layout.js. Every other client-app-facing route below is deliberately
  // NOT blanket-public: each one still checks (in-route, since middleware
  // only sees path+method, not who's asking) that the caller is either
  // staff or the client-app session that matches the client_id/patient_id
  // actually being requested — see lib/clientAppAuth.js's getClientSession
  // and every route below that imports it.
  /^\/client-app(\/.*)?$/,
  /^\/api\/client-app\/.*$/,
  // A logged-in client requesting their own appointment (any type,
  // including a video consult) still goes through the same staff-approved
  // intake_requests flow as a new-client submission — this is that same
  // POST, just also reachable by a client_id-carrying request now. The
  // in-route check (see app/api/intake-requests/route.js) only relaxes
  // for a request whose client_id matches the caller's own session;
  // client_id omitted (the anonymous new-client/QR flow) is unaffected.
  /^\/api\/intake-requests$/,
];

// GET-only client_id/patient_id-scoped data the client app reads about
// itself — each route still checks in-route that the id actually
// requested belongs to the caller (staff, or a matching client-app
// session), the same "public path, route does the real check" split as
// HOSPITALIZATION_READ_PATTERNS/VISIT_READ_PATTERNS below. A bare pattern
// here would also let the *staff-only* unfiltered form of these same
// routes (e.g. GET /api/invoices with no client_id, or GET
// /api/vaccinations?due=true) through with no login at all — the in-route
// check is what keeps those staff-wide queries staff-only.
const CLIENT_APP_READ_PATTERNS = [
  /^\/api\/patients$/,
  /^\/api\/patients\/[^/]+$/,
  /^\/api\/patients\/[^/]+\/report-overview$/,
  /^\/api\/appointments$/,
  /^\/api\/clients\/[^/]+$/,
  /^\/api\/clients\/[^/]+\/messages$/,
  /^\/api\/hospitalizations$/,
  /^\/api\/invoices$/,
  /^\/api\/vaccinations$/,
  /^\/api\/consent-form-requests$/,
];

// Hospitalization by-id, its /notes, and its /messages are public for the
// client portal's read-only status/worksheet/chat view, but each also has
// a staff-only write (PATCH the admission — status/room/cage/reason; POST
// a worksheet entry; POST a staff chat reply) under the same path — a
// plain path-only pattern would expose those too, so these need the same
// GET-only carve-out as /api/staff below. The client's own chat messages
// go in via POST /api/hospitalizations/:id/request-update instead, which
// is fully public (see PUBLIC_PATTERNS) since only the client ever sends
// through that route.
const HOSPITALIZATION_READ_PATTERNS = [
  /^\/api\/hospitalizations\/[^/]+$/,
  /^\/api\/hospitalizations\/[^/]+\/notes$/,
  /^\/api\/hospitalizations\/[^/]+\/messages$/,
];

// Same GET-only carve-out as hospitalizations above, for the video-consult
// portal page (app/portal/video-consult/[id]/page.jsx) — it fetches these
// two with no login, same as every other portal page. Missing this exactly
// reproduced the hospitalization/report-pdf gaps noted above: staff, whose
// browser already carries a valid login cookie, never noticed, while every
// client hit a silent 401 that the page could only show as "Link not
// found". Staying GET-only means a client link still can't create or end a
// call (POST/PATCH stay staff-only).
const VISIT_READ_PATTERNS = [/^\/api\/visits\/[^/]+$/, /^\/api\/visits\/[^/]+\/video-consult$/];

function isPublicPath(pathname, method) {
  if (pathname === '/api/staff' && method === 'GET') return true; // vet picker on the booking form
  if (pathname === '/api/vaccine-protocols' && method === 'GET') return true; // last-vaccination-type picker on the intake form
  // AttachmentGallery on the hospitalization portal (case photos + each
  // worksheet entry's own photos) reads this — GET-only, so a client link
  // can't also POST/DELETE attachments with no login (see migration/PR
  // history around 2026-09-09: this one was missing the same way the
  // report-pdf routes above were, silently emptying the portal's photo
  // gallery for every client while staff, already logged in, saw it fine).
  if (pathname === '/api/attachments' && method === 'GET') return true;
  if (method === 'GET' && HOSPITALIZATION_READ_PATTERNS.some((re) => re.test(pathname))) return true;
  if (method === 'GET' && VISIT_READ_PATTERNS.some((re) => re.test(pathname))) return true;
  if (method === 'GET' && CLIENT_APP_READ_PATTERNS.some((re) => re.test(pathname))) return true;
  // The client app's own writes — each still re-checks ownership in-route
  // (see lib/clientAppAuth.js's getClientSession) the same way the
  // GET routes above do. PATCH /api/patients/:id also serves staff's much
  // broader patient-edit form under the same path/method, so its in-route
  // check additionally restricts a non-staff caller to just
  // profile_photo_url — see EDITABLE_FIELDS there.
  if (method === 'POST' && /^\/api\/clients\/[^/]+\/(request-message|app-seen)$/.test(pathname)) return true;
  if (method === 'PATCH' && /^\/api\/patients\/[^/]+$/.test(pathname)) return true;
  return PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname, request.method)) {
    return NextResponse.next();
  }

  const staffPincode = await getEffectiveStaffPincode();
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
    (isUnderPath('/accounting') ||
      isUnderPath('/api/accounting') ||
      isUnderPath('/api/expenses') ||
      isUnderPath('/api/donations'));

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|icon.png|manifest.json|icons/).*)'],
};
