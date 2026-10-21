// app/api/social-posts/[id]/cover/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// GET ?h=<headline>&i=<media index> -> the cover photo with that headline
// laid over it (lib/socialCover.js), as a JPEG, for the live preview on the
// draft while staff edit the headline. Defaults to the post's own cover and
// headline. Any photo with its touch-ups (lib/socialTouchUp.js): the saved
// ones, or with ?t=1 the ones in the query (look, fx, fy, bt, bx, by, st;
// lib/socialTouchUpPlan.js) while staff try them. What's posted is drawn
// the same way (lib/metaSocial.js).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { renderCover } from '@/lib/socialCover';
import { preparePhoto } from '@/lib/socialTouchUp';
import { touchUpFromQuery } from '@/lib/socialTouchUpPlan';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const { data: post } = await supabaseAdmin.from('social_posts').select('media, cover_index, cover_headline').eq('id', params.id).maybeSingle();
  if (!post) return new Response('not found', { status: 404 });

  const media = Array.isArray(post.media) ? post.media : [];
  const index = searchParams.has('i') ? Number(searchParams.get('i')) : post.cover_index;
  const saved = media[index];
  const item = saved && searchParams.get('t') === '1' ? { ...saved, ...touchUpFromQuery(searchParams) } : saved;
  if (!item || item.kind !== 'image') return new Response('The cover is not a photo', { status: 400 });
  const headline = searchParams.has('h') ? searchParams.get('h') : post.cover_headline;

  // The scaled-down copy is plenty for a preview, and quicker to fetch.
  const res = await fetch(publicUrl(item.preview_path || item.path));
  if (!res.ok) return new Response('Could not read the photo', { status: 502 });
  try {
    const photo = await preparePhoto(Buffer.from(await res.arrayBuffer()), item, { maxWidth: 720 });
    const jpeg = await renderCover(photo, headline || '', { maxWidth: 720, quality: 82 });
    return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('social cover preview:', err);
    return new Response('Could not draw the cover', { status: 500 });
  }
}
