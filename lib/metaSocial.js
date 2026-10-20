// lib/metaSocial.js
// Posting Social posts (migrations 202, 203) to the clinic's Facebook Page
// and its linked Instagram business account through Meta's Graph API.
//
// The token is META_SOCIAL_ACCESS_TOKEN: a System User token from the
// clinic's Meta Business portfolio with the Page and the Instagram account
// assigned to it (see app/(admin)/social/connect for the steps). It falls
// back to META_WHATSAPP_ACCESS_TOKEN, so if the WhatsApp System User is
// simply given the Page as well, no new variable is needed. The Page is
// META_FACEBOOK_PAGE_ID, or the only Page the token can see.
//
// Each run moves a post forward and saves where it got to (publish_state),
// so a retry, or the five-minute sweep picking it up again, never posts
// anything twice. Instagram videos need Meta to process them first: the
// container is created on one run and published on a later one once it's
// ready.

import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { fitInstagramRatio, instagramPlan, facebookPlan } from '@/lib/socialPublishPlan';
import { renderCover, coverHeadlineText } from '@/lib/socialCover';

const GRAPH = 'https://graph.facebook.com/v21.0';
export const REQUIRED_PERMISSIONS = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'];

function token() {
  return process.env.META_SOCIAL_ACCESS_TOKEN || process.env.META_WHATSAPP_ACCESS_TOKEN || null;
}

async function graph(path, { method = 'GET', params = {}, accessToken } = {}) {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const url = method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === 'GET' ? {} : { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(e.error_user_msg || e.message || `Meta returned ${res.status}`);
  }
  return data;
}

// Which Page and Instagram account the token reaches, and which of the
// needed permissions it's missing. Never returns the token itself.
export async function getSocialConnection() {
  const accessToken = token();
  if (!accessToken) return { ok: false, reason: 'No Meta token is set up yet.', missing: REQUIRED_PERMISSIONS };
  let accounts;
  try {
    accounts = await graph('me/accounts', { params: { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50' }, accessToken });
  } catch (err) {
    return { ok: false, reason: `Meta said: ${err.message}`, missing: [] };
  }
  let granted = [];
  try {
    const perms = await graph('me/permissions', { accessToken });
    granted = (perms.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
  } catch {
    // Some token types can't list their own permissions: judge by what works.
  }
  const missing = granted.length ? REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p)) : [];
  const pages = accounts.data || [];
  const wanted = process.env.META_FACEBOOK_PAGE_ID;
  const page = wanted ? pages.find((p) => p.id === wanted) : pages.length === 1 ? pages[0] : null;
  if (!page) {
    return {
      ok: false,
      reason: pages.length === 0 ? "The token can't see any Facebook Page yet." : `The token sees ${pages.length} Pages: set META_FACEBOOK_PAGE_ID to the clinic's.`,
      pages: pages.map((p) => ({ id: p.id, name: p.name })),
      missing,
    };
  }
  const instagram = page.instagram_business_account || null;
  return {
    ok: !!instagram && missing.length === 0,
    reason: !instagram ? 'The Page has no Instagram business account linked.' : missing.length ? 'Some permissions are missing.' : null,
    page: { id: page.id, name: page.name },
    instagram: instagram ? { id: instagram.id, username: instagram.username } : null,
    missing,
    pageToken: page.access_token,
  };
}

// Instagram only takes JPEGs between 4:5 (portrait) and 1.91:1 (landscape):
// phone photos are often 3:4, so they're centre-cropped to fit. Saved next
// to the original as social/<id>/post-*.jpg and used for Facebook too.
async function postReadyImage(postId, item) {
  if (item.post_path) return item.post_path;
  const res = await fetch(publicUrl(item.path));
  if (!res.ok) throw new Error(`Could not read ${item.name || 'a photo'}`);
  // rotate() bakes in the phone's EXIF orientation first, so the sizes
  // below are the photo as people see it.
  const upright = await sharp(Buffer.from(await res.arrayBuffer())).rotate().toBuffer();
  const { width, height } = await sharp(upright).metadata();
  const crop = fitInstagramRatio(width, height);
  const buffer = await sharp(upright)
    .extract(crop)
    .resize({ width: Math.min(1440, crop.width), withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const path = `social/${postId}/post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await supabaseAdmin.storage.from('consult-files').upload(path, buffer, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path;
}

// The cover photo with its headline (lib/socialCover.js, migration 206),
// drawn on the post-ready JPEG. Kept in publish_state with what it was drawn
// from, so a retry reuses it but a changed headline or cover is redrawn.
async function coverWithHeadline(post, item, state) {
  const key = `${item.post_path}|${post.cover_headline}`;
  if (state.cover?.key === key) return state.cover.path;
  const res = await fetch(publicUrl(item.post_path));
  if (!res.ok) throw new Error('Could not read the cover photo');
  const buffer = await renderCover(Buffer.from(await res.arrayBuffer()), post.cover_headline);
  const path = `social/${post.id}/cover-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await supabaseAdmin.storage.from('consult-files').upload(path, buffer, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  state.cover = { key, path };
  return path;
}

async function saveState(postId, patch) {
  await supabaseAdmin.from('social_posts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', postId);
}

async function publishFacebook(post, conn, items, state) {
  if (state.status === 'done') return state;
  const plan = facebookPlan(items);
  const message = post.caption_facebook || post.caption_instagram || '';
  const accessToken = conn.pageToken;
  let id;
  if (plan.kind === 'video') {
    const res = await graph(`${conn.page.id}/videos`, { method: 'POST', params: { file_url: publicUrl(plan.items[0].path), description: message }, accessToken });
    id = res.id;
  } else if (plan.items.length === 1) {
    const res = await graph(`${conn.page.id}/photos`, { method: 'POST', params: { url: publicUrl(plan.items[0].post_path), message }, accessToken });
    id = res.post_id || res.id;
  } else {
    const photoIds = [];
    for (const item of plan.items) {
      const res = await graph(`${conn.page.id}/photos`, { method: 'POST', params: { url: publicUrl(item.post_path), published: 'false' }, accessToken });
      photoIds.push(res.id);
    }
    const params = { message };
    photoIds.forEach((pid, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: pid })));
    const res = await graph(`${conn.page.id}/feed`, { method: 'POST', params, accessToken });
    id = res.id;
  }
  return { status: 'done', id, permalink: `https://www.facebook.com/${id}` };
}

// Returns the new Instagram state: 'processing' while Meta works on a video.
async function publishInstagram(post, conn, items, state) {
  if (state.status === 'done') return state;
  const igId = conn.instagram.id;
  const accessToken = conn.pageToken;
  const caption = post.caption_instagram || post.caption_facebook || '';
  const plan = instagramPlan(items);
  let next = { ...state };

  if (!next.container_id) {
    if (plan.kind === 'carousel') {
      const children = [];
      for (const item of plan.items) {
        const params = item.kind === 'video'
          ? { media_type: 'VIDEO', video_url: publicUrl(item.path), is_carousel_item: 'true' }
          : { image_url: publicUrl(item.post_path), is_carousel_item: 'true' };
        children.push((await graph(`${igId}/media`, { method: 'POST', params, accessToken })).id);
      }
      next.children = children;
      next.pending_carousel = true;
    } else {
      const item = plan.items[0];
      const params = item.kind === 'video'
        ? { media_type: 'REELS', video_url: publicUrl(item.path), caption, share_to_feed: 'true' }
        : { image_url: publicUrl(item.post_path), caption };
      next.container_id = (await graph(`${igId}/media`, { method: 'POST', params, accessToken })).id;
    }
  }

  // A carousel's own container can only be made once every child is ready.
  const waitOn = next.pending_carousel ? next.children : [next.container_id];
  for (const cid of waitOn) {
    const { status_code: code, status } = await graph(cid, { params: { fields: 'status_code,status' }, accessToken });
    if (code === 'ERROR' || code === 'EXPIRED') throw new Error(`Instagram couldn't process a file (${status || code})`);
    if (code !== 'FINISHED') return { ...next, status: 'processing' };
  }
  if (next.pending_carousel) {
    next.container_id = (
      await graph(`${igId}/media`, { method: 'POST', params: { media_type: 'CAROUSEL', children: next.children.join(','), caption }, accessToken })
    ).id;
    next.pending_carousel = false;
    const { status_code: code } = await graph(next.container_id, { params: { fields: 'status_code' }, accessToken });
    if (code !== 'FINISHED') return { ...next, status: 'processing' };
  }
  const published = await graph(`${igId}/media_publish`, { method: 'POST', params: { creation_id: next.container_id }, accessToken });
  let permalink = null;
  try {
    permalink = (await graph(published.id, { params: { fields: 'permalink' }, accessToken })).permalink || null;
  } catch {}
  return { status: 'done', id: published.id, permalink };
}

// Moves one approved post forward. Returns { status: 'posted' | 'processing'
// | 'error' | 'busy', error }.
export async function publishSocialPost(postId) {
  const lockUntil = new Date(Date.now() + 3 * 60 * 1000).toISOString();
  const { data: claimed } = await supabaseAdmin
    .from('social_posts')
    .update({ publish_lock_until: lockUntil })
    .eq('id', postId)
    .eq('status', 'approved')
    .or(`publish_lock_until.is.null,publish_lock_until.lt.${new Date().toISOString()}`)
    .select('*');
  const post = claimed?.[0];
  if (!post) return { status: 'busy' };

  const state = { instagram: {}, facebook: {}, ...(post.publish_state || {}) };
  const targets = post.publish_targets?.length ? post.publish_targets : ['instagram', 'facebook'];
  try {
    const conn = await getSocialConnection();
    if (!conn.page || !conn.pageToken) throw new Error(conn.reason || 'Instagram and Facebook are not connected');
    if (targets.includes('instagram') && !conn.instagram) throw new Error(conn.reason || 'No Instagram account is linked to the Page');

    // Post-ready JPEGs for every photo, saved on the post so it's done once.
    const media = Array.isArray(post.media) ? post.media : [];
    const order = [post.cover_index, ...media.map((_, i) => i).filter((i) => i !== post.cover_index)];
    const items = [];
    let mediaChanged = false;
    for (const i of order) {
      const m = media[i];
      if (!m || m.excluded) continue;
      if (m.kind === 'image' && !m.post_path) {
        m.post_path = await postReadyImage(post.id, m);
        mediaChanged = true;
      }
      items.push(m);
    }
    if (mediaChanged) await saveState(post.id, { media });
    if (items.length === 0) throw new Error('There is nothing left to post: every file is left out');
    // A headline goes on the first photo only; a video cover goes out as it is.
    if (items[0].kind === 'image' && coverHeadlineText(post.cover_headline)) {
      items[0] = { ...items[0], post_path: await coverWithHeadline(post, items[0], state) };
      await saveState(post.id, { publish_state: state });
    }

    if (targets.includes('facebook')) {
      state.facebook = await publishFacebook(post, conn, items, state.facebook);
      await saveState(post.id, { publish_state: state });
    }
    if (targets.includes('instagram')) {
      state.instagram = await publishInstagram(post, conn, items, state.instagram);
      await saveState(post.id, { publish_state: state });
    }

    const done = targets.every((t) => state[t]?.status === 'done');
    await saveState(post.id, {
      publish_state: state,
      publish_error: null,
      publish_lock_until: null,
      ...(done ? { status: 'posted', posted_at: new Date().toISOString() } : {}),
    });
    return { status: done ? 'posted' : 'processing' };
  } catch (err) {
    await saveState(post.id, { publish_state: state, publish_error: err.message, publish_lock_until: null, scheduled_for: null });
    return { status: 'error', error: err.message };
  }
}

// The five-minute sweep: approved posts that are due, or whose Instagram
// video was still processing last time.
export async function sweepDueSocialPosts() {
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from('social_posts')
    .select('id, scheduled_for, publish_state, publish_error')
    .eq('status', 'approved')
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', now)
    .limit(5);
  const results = [];
  for (const row of data || []) results.push({ id: row.id, ...(await publishSocialPost(row.id)) });
  return { checked: (data || []).length, results };
}
