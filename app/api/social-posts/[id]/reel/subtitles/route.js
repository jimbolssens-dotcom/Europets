// app/api/social-posts/[id]/reel/subtitles/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// POST { index } -> what's said in that clip's part of the Reel, with word
// timings (lib/socialReel.js, transcribeReelClip; AssemblyAI), as the clip's
// `subtitles`, switched on. The page saves it on the post (like ./clip, so
// clips done side by side don't race each other's saves).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { transcribeReelClip } from '@/lib/socialReel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: post } = await supabaseAdmin.from('social_posts').select('id, media').eq('id', params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    return NextResponse.json(await transcribeReelClip(post, Number(body.index)));
  } catch (err) {
    console.error('social reel subtitles:', err);
    return NextResponse.json({ error: err.message || "Couldn't hear what's said" }, { status: 500 });
  }
}
