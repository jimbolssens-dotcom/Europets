// app/api/accounting/website-credentials/route.js
// GET -> the login for every third-party account the clinic's web system
// depends on (100WebSpace, Wix, eNom, the notification mailbox), read from
// server-side env vars and handed to the /accounting/website page.
//
// These live in Vercel env vars rather than in this file or the database
// specifically so they never end up committed to source control (readable
// by anyone with repo access, permanently, even if later "removed") or
// sitting in a shared document. Behind the accounting password gate (see
// middleware.js's needsAccountingPassword) like the rest of
// /api/accounting/* — that's the actual access control here, not secrecy
// of the route path.

import { NextResponse } from 'next/server';

const LOGINS = [
  {
    id: 'hundredws',
    service: '100WebSpace',
    url: 'https://cp.100ws.com',
    username: process.env.HUNDREDWS_LOGIN_USERNAME || null,
    password: process.env.HUNDREDWS_LOGIN_PASSWORD || null,
  },
  {
    id: 'wix',
    service: 'Wix',
    url: 'https://www.wix.com',
    username: process.env.WIX_LOGIN_USERNAME || null,
    password: process.env.WIX_LOGIN_PASSWORD || null,
  },
  {
    id: 'enom',
    service: 'eNom (epc.vet registrar)',
    url: 'https://access.enom.com',
    username: null,
    password: process.env.ENOM_LOGIN_PASSWORD || null,
    note: 'Username not on file yet — confirm and add via domain.com or eNom support.',
  },
  {
    id: 'notification-email',
    service: 'Notification email',
    url: 'https://outlook.com',
    username: 'europetshospital@hotmail.com',
    password: process.env.WEBSITE_NOTIFICATION_EMAIL_PASSWORD || null,
    note: 'Contact address on file with 100WebSpace for ticket/account notifications.',
  },
];

export async function GET() {
  return NextResponse.json({ logins: LOGINS });
}
