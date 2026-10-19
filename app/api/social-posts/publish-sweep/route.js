// app/api/social-posts/publish-sweep/route.js
// GET -> posts the Social posts that are due and finishes Instagram videos
// still being processed (lib/metaSocial.js). Run every five minutes by
// Vercel Cron (vercel.json); public in middleware.js, verified with the
// same CRON_SECRET bearer token as the other cron routes.

import { NextResponse } from 'next/server';
import { sweepDueSocialPosts } from '@/lib/metaSocial';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await sweepDueSocialPosts());
}
