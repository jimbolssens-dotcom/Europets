// app/api/social-posts/[id]/story-frame/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// GET ?i=<media index>&first=1&t=<text> -> that photo as a Story frame
// (lib/socialStory.js), small, as a JPEG, for the preview on the draft while
// staff edit the text. What's posted is drawn the same way at full size
// (lib/metaSocial.js).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { renderStoryFrame } from '@/lib/socialStory';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const { data: post } = await supabaseAdmin.from('social_posts').select('media').eq('id', params.id).maybeSingle();
  if (!post) return new Response('not found', { status: 404 });
  const item = (Array.isArray(post.media) ? post.media : [])[Number(searchParams.get('i'))];
  if (!item || item.kind !== 'image') return new Response('Not a photo', { status: 400 });

  // The scaled-down copy is plenty for a preview, and quicker to fetch.
  const res = await fetch(publicUrl(item.preview_path || item.path));
  if (!res.ok) return new Response('Could not read the photo', { status: 502 });
  try {
    const jpeg = await renderStoryFrame(Buffer.from(await res.arrayBuffer()), searchParams.get('t') || '', {
      first: searchParams.get('first') === '1',
      width: 360,
      quality: 80,
    });
    return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('social story frame preview:', err);
    return new Response('Could not draw the frame', { status: 500 });
  }
}
