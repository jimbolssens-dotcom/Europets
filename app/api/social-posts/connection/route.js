// app/api/social-posts/connection/route.js
// GET -> whether the app can post to the clinic's Facebook Page and
// Instagram (lib/metaSocial.js): which Page and account, and any missing
// permission. Never returns a token.

import { NextResponse } from 'next/server';
import { getSocialConnection } from '@/lib/metaSocial';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { pageToken, ...conn } = await getSocialConnection();
  void pageToken;
  return NextResponse.json(conn, { headers: { 'Cache-Control': 'no-store' } });
}
