// app/api/staff/[id]/login-code/route.js
// Staff only (middleware.js). Their own login (migration 225,
// lib/personalLogin.js), for interns:
// POST   -> a new 6-digit login code, shown once (replaces any earlier one)
// DELETE -> removes it: that login stops working at once

import { NextResponse } from 'next/server';
import { newLoginCode, removeLoginCode } from '@/lib/personalLogin';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const result = await newLoginCode(params.id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request, { params }) {
  const result = await removeLoginCode(params.id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
