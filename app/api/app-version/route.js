// app/api/app-version/route.js
// GET /api/app-version -> { buildId } for whatever's actually deployed
// right now. Polled by app/_components/AppVersionWatcher.jsx (mounted in
// both app/(admin)/layout.js and app/mobile/layout.js) to detect a stale
// already-loaded copy of the app — see that file for why a page-level
// Cache-Control header alone isn't enough to fix this on an installed
// home-screen icon or a terminal that's just been left open.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID || 'unknown' },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
  );
}
