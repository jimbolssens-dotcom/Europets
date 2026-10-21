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
// ready. A post can go out as photos, a Reel or a Story (one frame after
// another, migration 210).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { instagramPlan, facebookPlan } from '@/lib/socialPublishPlan';
import { renderCover, coverHeadlineText } from '@/lib/socialCover';
import { reelKey, reelTexts, storyItems, storyFrameKey } from '@/lib/socialReelPlan';
import { renderStoryFrame } from '@/lib/socialStory';
import { preparePhoto } from '@/lib/socialTouchUp';
import { touchUpKey } from '@/lib/socialTouchUpPlan';
import { renderLayout } from '@/lib/socialLayout';
import { layoutItems, layoutKey, afterLayout } from '@/lib/socialLayoutPlan';

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
// phone photos are often 3:4, so they're cropped to fit (around the spot
// staff picked, else the centre), with the touch-ups from the draft
// (lib/socialTouchUp.js). Saved next to the original as
// social/<id>/post-*.jpg and used for Facebook too; post_key says which
// touch-ups it has, so changed ones are drawn again.
function postReady(item) {
  return !!item.post_path && (item.post_key || '') === touchUpKey(item);
}

async function postReadyImage(postId, item) {
  if (postReady(item)) return item.post_path;
  const res = await fetch(publicUrl(item.path));
  if (!res.ok) throw new Error(`Could not read ${item.name || 'a photo'}`);
  const buffer = await preparePhoto(Buffer.from(await res.arrayBuffer()), item);
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

// The post's layout picture (a Before / After or a Collage, migration 211,
// lib/socialLayout.js) with the cover text on it, drawn from the original
// photos. Kept in publish_state with what it was drawn from, like the cover.
async function layoutImage(post, items, state) {
  const key = layoutKey(post, items);
  if (state.layout?.key === key) return state.layout.path;
  const photos = await Promise.all(
    items.map(async (i) => {
      const item = post.media[i];
      const res = await fetch(publicUrl(item.path));
      if (!res.ok) throw new Error(`Could not read ${item.name || 'a photo'}`);
      return { image: Buffer.from(await res.arrayBuffer()), item };
    })
  );
  const buffer = await renderLayout(post.layout.kind, photos, post.cover_headline);
  const path = `social/${post.id}/layout-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await supabaseAdmin.storage.from('consult-files').upload(path, buffer, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  state.layout = { key, path };
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

// Stories (migration 210): each photo drawn as a full-screen frame with its
// text (lib/socialStory.js), uploaded once and kept in publish_state keyed by
// what it was drawn from; each clip goes up as it is. Returns the frames in
// order: [{ kind, url }].
async function storyFrames(post, state) {
  const items = storyItems(post);
  const texts = reelTexts(post, items);
  state.story_frames = state.story_frames || {};
  const frames = [];
  for (let k = 0; k < items.length; k++) {
    const item = post.media[items[k]];
    if (item.kind === 'video') {
      frames.push({ kind: 'video', url: publicUrl(item.path) });
      continue;
    }
    const key = storyFrameKey(item, `${k === 0 ? 'first' : ''}|${texts[k]}`);
    if (state.story_frames[key]) {
      frames.push({ kind: 'image', url: publicUrl(state.story_frames[key]) });
      continue;
    }
    const res = await fetch(publicUrl(item.path));
    if (!res.ok) throw new Error(`Could not read ${item.name || 'a photo'}`);
    const jpeg = await renderStoryFrame(Buffer.from(await res.arrayBuffer()), texts[k], { first: k === 0, item });
    const path = `social/${post.id}/story-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    const { error } = await supabaseAdmin.storage.from('consult-files').upload(path, jpeg, { contentType: 'image/jpeg' });
    if (error) throw new Error(error.message);
    state.story_frames[key] = path;
    frames.push({ kind: 'image', url: publicUrl(path) });
  }
  if (frames.length === 0) throw new Error('There is nothing left to post: every file is left out');
  return frames;
}

// Instagram Stories: one container per frame, published in order. A clip's
// container has to finish processing first, so this can take more than one
// run; what's done is kept in state.frames.
async function publishInstagramStory(conn, frames, state) {
  if (state.status === 'done') return state;
  const igId = conn.instagram.id;
  const accessToken = conn.pageToken;
  const next = { ...state, frames: [...(state.frames || [])] };
  for (let k = 0; k < frames.length; k++) {
    const done = next.frames[k] || {};
    if (done.id) continue;
    if (!done.container_id) {
      const params = frames[k].kind === 'video'
        ? { media_type: 'STORIES', video_url: frames[k].url }
        : { media_type: 'STORIES', image_url: frames[k].url };
      done.container_id = (await graph(`${igId}/media`, { method: 'POST', params, accessToken })).id;
      next.frames[k] = done;
    }
    const { status_code: code, status } = await graph(done.container_id, { params: { fields: 'status_code,status' }, accessToken });
    if (code === 'ERROR' || code === 'EXPIRED') throw new Error(`Instagram couldn't process a Story frame (${status || code})`);
    if (code !== 'FINISHED') return { ...next, status: 'processing' };
    done.id = (await graph(`${igId}/media_publish`, { method: 'POST', params: { creation_id: done.container_id }, accessToken })).id;
    next.frames[k] = done;
  }
  return { ...next, status: 'done' };
}

// Facebook Page Stories: a photo is uploaded unpublished, then made a Story;
// a clip goes through the Page's video Story upload, from its link.
async function publishFacebookStory(conn, frames, state) {
  if (state.status === 'done') return state;
  const pageId = conn.page.id;
  const accessToken = conn.pageToken;
  const next = { ...state, frames: [...(state.frames || [])] };
  for (let k = 0; k < frames.length; k++) {
    if (next.frames[k]?.id) continue;
    let id;
    if (frames[k].kind === 'video') {
      const start = await graph(`${pageId}/video_stories`, { method: 'POST', params: { upload_phase: 'start' }, accessToken });
      const up = await fetch(start.upload_url, { method: 'POST', headers: { Authorization: `OAuth ${accessToken}`, file_url: frames[k].url } });
      if (!up.ok) throw new Error(`Facebook didn't take the Story clip (${up.status})`);
      id = (await graph(`${pageId}/video_stories`, { method: 'POST', params: { upload_phase: 'finish', video_id: start.video_id }, accessToken })).post_id || start.video_id;
    } else {
      const photo = await graph(`${pageId}/photos`, { method: 'POST', params: { url: frames[k].url, published: 'false' }, accessToken });
      id = (await graph(`${pageId}/photo_stories`, { method: 'POST', params: { photo_id: photo.id }, accessToken })).post_id || photo.id;
    }
    next.frames[k] = { id };
  }
  return { ...next, status: 'done' };
}

// Sends the files to each network not done yet, saving progress after each.
async function finishPublish(post, conn, targets, state, items) {
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

    // A Story: frame after frame, on each network (migration 210).
    if (post.post_as === 'story') {
      const frames = await storyFrames(post, state);
      await saveState(post.id, { publish_state: state });
      if (targets.includes('facebook')) {
        state.facebook = await publishFacebookStory(conn, frames, state.facebook);
        await saveState(post.id, { publish_state: state });
      }
      if (targets.includes('instagram')) {
        state.instagram = await publishInstagramStory(conn, frames, state.instagram);
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
    }

    // A Reel made from the photos (lib/socialReel.js) goes out as the one
    // video: a Reel on Instagram, a video on the Facebook Page.
    if (post.post_as === 'reel') {
      if (!post.reel?.path || post.reel.key !== reelKey(post)) throw new Error('The Reel is out of date: make it again on the draft');
      return await finishPublish(post, conn, targets, state, [{ kind: 'video', path: post.reel.path, name: 'reel.mp4' }]);
    }

    // Post-ready JPEGs for every photo, saved on the post so it's done once.
    // With a layout, its picture goes first and the photos not in it follow.
    const media = Array.isArray(post.media) ? post.media : [];
    const layout = layoutItems(post);
    const order = layout ? afterLayout(post, layout) : [post.cover_index, ...media.map((_, i) => i).filter((i) => i !== post.cover_index)];
    const items = [];
    let mediaChanged = false;
    for (const i of order) {
      const m = media[i];
      if (!m || m.excluded) continue;
      if (m.kind === 'image' && !postReady(m)) {
        m.post_path = await postReadyImage(post.id, m);
        m.post_key = touchUpKey(m);
        mediaChanged = true;
      }
      items.push(m);
    }
    if (mediaChanged) await saveState(post.id, { media });
    if (layout) {
      const path = await layoutImage(post, layout, state);
      await saveState(post.id, { publish_state: state });
      return await finishPublish(post, conn, targets, state, [{ kind: 'image', path, post_path: path, name: 'layout.jpg' }, ...items]);
    }
    if (items.length === 0) throw new Error('There is nothing left to post: every file is left out');
    // A headline goes on the first photo only; a video cover goes out as it is.
    if (items[0].kind === 'image' && coverHeadlineText(post.cover_headline)) {
      items[0] = { ...items[0], post_path: await coverWithHeadline(post, items[0], state) };
      await saveState(post.id, { publish_state: state });
    }

    return await finishPublish(post, conn, targets, state, items);
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
