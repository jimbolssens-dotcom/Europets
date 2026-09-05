// app/api/login/route.js
// POST   -> check the staff password, set the staff_auth cookie on success
// DELETE -> log out (clear the cookie)
//
// Deliberately its own top-level path (not under /api/anything-else/) so
// middleware.js's staff-wide gate doesn't also block logging in.

import { NextResponse } from 'next/server';
import { STAFF_COOKIE } from '@/lib/staffAuth';
import { sha256Hex } from '@/lib/accountingAuth';

export async function POST(request) {
  const { password } = await request.json();
  const expected = process.env.STAFF_PASSWORD;

  if (!expected) {
    return NextResponse.json({ error: 'Staff access is not configured' }, { status: 503 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

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
