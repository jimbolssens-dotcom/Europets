// app/api/social-posts/[id]/layout/route.js
// Staff only (middleware.js gates every path not in its public patterns).
// GET ?kind=before_after|collage&items=0,2&h=<cover text>[&full=1] -> that
// layout picture (lib/socialLayout.js, migration 211) as a JPEG: small for
// the live preview on the draft while staff pick photos, full size with
// full=1 for posting by hand. The photos' saved touch-ups are drawn on them.
// What's posted is drawn the same way (lib/metaSocial.js).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { renderLayout } from '@/lib/socialLayout';
import { cleanLayout, layoutItems } from '@/lib/socialLayoutPlan';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const { data: post } = await supabaseAdmin.from('social_posts').select('media, cover_headline, cover_index').eq('id', params.id).maybeSingle();
  if (!post) return new Response('not found', { status: 404 });

  const full = searchParams.get('full') === '1';
  const layout = cleanLayout({ kind: searchParams.get('kind'), items: String(searchParams.get('items') || '').split(',').filter(Boolean).map(Number) }, post.media);
  const items = layoutItems({ ...post, post_as: 'photos', layout });
  if (!items) return new Response('Pick more photos for this layout', { status: 400 });
  const headline = searchParams.has('h') ? searchParams.get('h') : post.cover_headline;

  try {
    const photos = await Promise.all(
      items.map(async (i) => {
        const item = post.media[i];
        // The scaled-down copy is plenty for the preview.
        const res = await fetch(publicUrl(full ? item.path : item.preview_path || item.path));
        if (!res.ok) throw new Error('Could not read a photo');
        return { image: Buffer.from(await res.arrayBuffer()), item };
      })
    );
    const jpeg = await renderLayout(layout.kind, photos, headline || '', full ? {} : { width: 720, quality: 82 });
    return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('social layout preview:', err);
    return new Response('Could not draw the layout', { status: 500 });
  }
}
