// app/api/social-posts/[id]/reel/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// POST { cover_headline?, reel_lines?, reel_music?, clips? } -> saves those,
// makes the post's Reel from its photos and clips (lib/socialReel.js,
// migration 207) and sets the post to go out as a Reel. Returns the post's
// new `reel` with its URL. Takes about half a minute. clips: { [media index]:
// reel_clip } from ./clip, the clips' prepared parts, saved on the post here.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { makeSocialReel } from '@/lib/socialReel';
import { cleanReelEdits, preparedClip } from '@/lib/socialReelPlan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: post } = await supabaseAdmin.from('social_posts').select('*').eq('id', params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (post.status !== 'draft' && post.status !== 'new') return NextResponse.json({ error: 'Only a draft can get a new Reel' }, { status: 409 });

  const edits = { ...cleanReelEdits(body, post.media), post_as: 'reel' };
  const clips = body.clips && typeof body.clips === 'object' ? body.clips : {};
  if (Object.keys(clips).length) {
    edits.media = (post.media || []).map((m, i) => {
      const clip = clips[i];
      if (!clip || !preparedClip({ path: m.path, reel_clip: clip }, post.id)) return m;
      return { ...m, reel_clip: { path: clip.path, source: clip.source, length: Number(clip.length) } };
    });
  }
  const next = { ...post, ...edits };
  try {
    const reel = await makeSocialReel(next, new URL(request.url).origin);
    await supabaseAdmin.from('social_posts').update({ ...edits, updated_at: new Date().toISOString() }).eq('id', post.id);
    return NextResponse.json({ ...reel, url: publicUrl(reel.path) });
  } catch (err) {
    console.error('social reel:', err);
    return NextResponse.json({ error: err.message || "Couldn't make the Reel" }, { status: 500 });
  }
}
