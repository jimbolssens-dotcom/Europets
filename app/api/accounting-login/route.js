// app/api/accounting-login/route.js
// POST   -> check the password, set the accounting_auth cookie on success
// DELETE -> log out (clear the cookie)
//
// Deliberately its own top-level path (not under /api/accounting/) so
// middleware.js's gate on /api/accounting/:path* doesn't also block
// logging in.

import { NextResponse } from 'next/server';
import { ACCOUNTING_COOKIE, sha256Hex } from '@/lib/accountingAuth';

export async function POST(request) {
  const { password } = await request.json();
  const expected = process.env.ACCOUNTING_PASSWORD;

  if (!expected) {
    return NextResponse.json({ error: 'Accounting access is not configured' }, { status: 503 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const token = await sha256Hex(expected);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCOUNTING_COOKIE, token, {
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
  res.cookies.delete(ACCOUNTING_COOKIE);
  return res;
}
