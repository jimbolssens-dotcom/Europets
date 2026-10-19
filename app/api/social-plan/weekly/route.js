// app/api/social-plan/weekly/route.js
// GET -> makes this week's Social plan on Monday morning if there isn't one
// yet (lib/socialPlan.js), so it's waiting when staff open the Social page.
// Vercel Cron (vercel.json); public in middleware.js, verified with the
// same CRON_SECRET bearer token as the other cron routes.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateSocialPlan, weekStartFor } from '@/lib/socialPlan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data: existing } = await supabaseAdmin.from('social_plans').select('week_start').eq('week_start', weekStartFor()).maybeSingle();
  if (existing) return NextResponse.json({ skipped: 'already planned' });
  const result = await generateSocialPlan();
  return NextResponse.json(result.error ? { error: result.error } : { planned: result.data.week_start });
}
