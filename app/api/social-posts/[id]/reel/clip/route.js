// app/api/social-posts/[id]/reel/clip/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// POST { index } -> cuts that video clip's few seconds out, sized for the
// Reel (lib/socialReel.js, prepareReelClip), and returns its `reel_clip`.
// The page calls this once per clip, side by side (a phone's 4K clip alone
// can take most of a minute), then hands them all to ../ (POST reel), which
// saves them on the post: saving here would race the other clips' calls.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { prepareReelClip } from '@/lib/socialReel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: post } = await supabaseAdmin.from('social_posts').select('id, status, media').eq('id', params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    return NextResponse.json(await prepareReelClip(post, Number(body.index)));
  } catch (err) {
    console.error('social reel clip:', err);
    return NextResponse.json({ error: err.message || "Couldn't get the video ready" }, { status: 500 });
  }
}
