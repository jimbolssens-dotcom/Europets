// app/api/social-posts/stats/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// POST -> fetch the numbers of every post from the last few weeks now
// (lib/metaSocial.js, refreshSocialStats; migration 212), for the Social
// page's "↻ Numbers" button. Returns { updated, errors }.

import { NextResponse } from 'next/server';
import { refreshSocialStats } from '@/lib/metaSocial';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  return NextResponse.json(await refreshSocialStats({ force: true, limit: 30 }));
}
