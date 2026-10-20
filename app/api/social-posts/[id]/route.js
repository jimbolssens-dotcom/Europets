// app/api/social-posts/[id]/route.js
// GET   -> one post for the Social page: its files (with URLs), captions, the
//          AI's notes, and whether the owner has agreed to social media.
// PATCH -> { media, story, patient_id } while uploading, or
//          { action: 'save' | 'approve' | 'posted' | 'reopen' | 'unschedule' | 'discard',
//            caption_instagram, caption_facebook, cover_headline, cover_index, media, staff_id,
//            post_as, reel_lines, reel_music }
//
// Approving checks the owner's consent (lib/socialPosts.js) on the server
// too, not only in the page. Server-only table (migration 202).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { approvalBlocker, postConsent } from '@/lib/socialPosts';
import { cleanReelEdits, reelKey } from '@/lib/socialReelPlan';

export const dynamic = 'force-dynamic';

const SELECT =
  '*, patients(id, name, species, client_id, clients(id, social_media_consent)), creator:staff!social_posts_created_by_fkey(full_name), approver:staff!social_posts_approved_by_fkey(full_name)';

async function load(id) {
  return supabaseAdmin.from('social_posts').select(SELECT).eq('id', id).maybeSingle();
}

function present(post) {
  const media = (Array.isArray(post.media) ? post.media : []).map((m) => ({
    ...m,
    url: publicUrl(m.path),
    preview_url: publicUrl(m.preview_path || m.path),
  }));
  const reel = post.reel?.path ? { ...post.reel, url: publicUrl(post.reel.path), current: post.reel.key === reelKey(post) } : null;
  return {
    ...post,
    media,
    reel,
    consent: postConsent(post),
    client_id: post.patients?.client_id || null,
    created_by_name: post.creator?.full_name || null,
    approved_by_name: post.approver?.full_name || null,
    blocker: approvalBlocker(post),
  };
}

export async function GET(request, { params }) {
  const { data, error } = await load(params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(present(data), { headers: { 'Cache-Control': 'no-store' } });
}

// Only the fields staff can change, and files only under this post's folder.
function cleanMedia(media, id) {
  if (!Array.isArray(media)) return undefined;
  return media
    .filter((m) => m && typeof m.path === 'string' && m.path.startsWith(`social/${id}/`))
    .map((m) => ({
      path: m.path,
      preview_path: typeof m.preview_path === 'string' && m.preview_path.startsWith(`social/${id}/`) ? m.preview_path : null,
      post_path: typeof m.post_path === 'string' && m.post_path.startsWith(`social/${id}/`) ? m.post_path : null,
      kind: m.kind === 'video' ? 'video' : 'image',
      name: typeof m.name === 'string' ? m.name.slice(0, 200) : null,
      excluded: !!m.excluded,
      note: typeof m.note === 'string' ? m.note.slice(0, 300) : null,
    }));
}

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: post, error } = await load(params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const update = { updated_at: new Date().toISOString() };
  const media = cleanMedia(body.media, params.id);
  if (media) update.media = media;
  if (typeof body.caption_instagram === 'string') update.caption_instagram = body.caption_instagram;
  if (typeof body.caption_facebook === 'string') update.caption_facebook = body.caption_facebook;
  if (Number.isInteger(body.cover_index)) update.cover_index = body.cover_index;
  if (typeof body.story === 'string') update.story = body.story.trim() || null;
  Object.assign(update, cleanReelEdits(body, update.media || post.media));

  const action = body.action || 'save';
  if (action === 'approve') {
    const next = { ...post, ...update };
    const blocker = approvalBlocker(next);
    if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
    update.status = 'approved';
    update.approved_at = new Date().toISOString();
    update.approved_by = body.staff_id || null;
  } else if (action === 'posted') {
    if (post.status !== 'approved') return NextResponse.json({ error: 'Approve the post first' }, { status: 409 });
    update.status = 'posted';
    update.posted_at = new Date().toISOString();
  } else if (action === 'reopen') {
    update.status = 'draft';
    update.approved_at = null;
    update.approved_by = null;
    update.posted_at = null;
  } else if (action === 'unschedule') {
    update.scheduled_for = null;
  } else if (action === 'discard') {
    update.status = 'discarded';
  } else if (post.status === 'posted' || post.status === 'discarded') {
    return NextResponse.json({ error: 'This post is closed' }, { status: 409 });
  }

  const { error: saveError } = await supabaseAdmin.from('social_posts').update(update).eq('id', params.id);
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
  const { data: saved } = await load(params.id);
  return NextResponse.json(present(saved));
}
