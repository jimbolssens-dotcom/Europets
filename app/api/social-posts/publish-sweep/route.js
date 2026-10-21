// app/api/social-posts/publish-sweep/route.js
// GET -> posts the Social posts that are due and finishes Instagram videos
// still being processed (lib/metaSocial.js), then fetches the numbers of
// recently posted ones that are due (migration 212). Run every five minutes by
// Vercel Cron (vercel.json); public in middleware.js, verified with the
// same CRON_SECRET bearer token as the other cron routes.

import { NextResponse } from 'next/server';
import { sweepDueSocialPosts, refreshSocialStats } from '@/lib/metaSocial';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const published = await sweepDueSocialPosts();
  // The numbers never hold up posting.
  const stats = await refreshSocialStats({ limit: 4 }).catch((err) => ({ error: err.message }));
  return NextResponse.json({ ...published, stats });
}
