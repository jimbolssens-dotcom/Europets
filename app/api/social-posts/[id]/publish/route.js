// app/api/social-posts/[id]/publish/route.js
// POST { when: 'now' | ISO time, targets: ['instagram', 'facebook'] } ->
// post an approved Social post now, or schedule it for the five-minute
// sweep (app/api/social-posts/publish-sweep). "Now" also sets scheduled_for,
// so an Instagram video still processing at the end of this request is
// finished by the sweep.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publishSocialPost } from '@/lib/metaSocial';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const targets = (Array.isArray(body.targets) ? body.targets : ['instagram', 'facebook']).filter((t) => t === 'instagram' || t === 'facebook');
  if (targets.length === 0) return NextResponse.json({ error: 'Pick Instagram, Facebook or both' }, { status: 400 });

  const now = body.when === 'now' || !body.when;
  const at = now ? new Date() : new Date(body.when);
  if (Number.isNaN(at.getTime())) return NextResponse.json({ error: 'That time is not valid' }, { status: 400 });
  if (!now && at.getTime() < Date.now() - 60 * 1000) return NextResponse.json({ error: 'That time has already passed' }, { status: 400 });

  const { data: post } = await supabaseAdmin.from('social_posts').select('id, status').eq('id', params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (post.status !== 'approved') return NextResponse.json({ error: 'Approve the post first' }, { status: 409 });

  await supabaseAdmin
    .from('social_posts')
    .update({ publish_targets: targets, scheduled_for: at.toISOString(), publish_error: null, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (!now) return NextResponse.json({ status: 'scheduled', scheduled_for: at.toISOString() });
  const result = await publishSocialPost(params.id);
  if (result.status === 'error') return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result);
}
