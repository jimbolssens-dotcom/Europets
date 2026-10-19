// app/api/social-plan/route.js
// GET  -> this week's Social plan (lib/socialPlan.js) or null, and which of
//         its ideas already have a post (social_posts.plan_idea).
// POST -> make (or remake) this week's plan with the AI.
// Staff only, like the rest of /api.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateSocialPlan, weekStartFor } from '@/lib/socialPlan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function withProgress(plan) {
  if (!plan) return { plan: null };
  const { data: posts } = await supabaseAdmin
    .from('social_posts')
    .select('id, status, plan_idea')
    .like('plan_idea', `${plan.week_start}:%`)
    .neq('status', 'discarded');
  const done = {};
  for (const p of posts || []) {
    const n = Number(String(p.plan_idea).split(':')[1]);
    if (!done[n] || p.status === 'posted') done[n] = { id: p.id, status: p.status };
  }
  return { plan, done };
}

export async function GET() {
  const { data, error } = await supabaseAdmin.from('social_plans').select('*').eq('week_start', weekStartFor()).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await withProgress(data), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  const result = await generateSocialPlan();
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json(await withProgress(result.data));
}
