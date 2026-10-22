// lib/payLinkPages.js
// A rescuer's personalised pay page (migration 214) for their personal
// payment link (lib/clientPayLinks.js, website/app/pay/[token]): the cover
// and Instagram Story pictures in the clinic's social style, drawn from the
// photo staff picked when they save the page, and the rescuer's Instagram
// profile and latest posts, kept fresh twice a day.

import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { publicUrl } from '@/lib/socialDraft';
import { renderCover, headlineFont, HEXFIELD } from '@/lib/socialCover';
import { renderStoryFrame } from '@/lib/socialStory';
import { preparePhoto } from '@/lib/socialTouchUp';
import { fetchInstagramProfile } from '@/lib/metaSocial';
import { payLinkUrl } from '@/lib/clientPayLinks';

const INSTAGRAM_REFRESH_MS = 12 * 60 * 60 * 1000;

async function upload(linkId, name, buffer) {
  const path = `social/paypage-${linkId}/${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await supabaseAdmin.storage.from('consult-files').upload(path, buffer, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path;
}

// The link's address in a white pill along the bottom of the Story
// picture, so people who see the Story can type it in (Story pictures
// can't carry a link of their own).
export async function withLinkPill(jpeg, url) {
  const { width: W, height: H } = await sharp(jpeg).metadata();
  const f = headlineFont();
  const text = url.replace(/^https?:\/\//, '');
  const size = Math.round(W * 0.042);
  const textW = f.getAdvanceWidth(text, size);
  const padX = Math.round(size * 0.9);
  const h = Math.round(size * 2);
  const w = Math.round(textW + padX * 2);
  const x = Math.round((W - w) / 2);
  const y = Math.round(H * 0.86);
  const path = f.getPath(text, x + padX, y + Math.round(h / 2 + size * 0.34), size).toPathData(1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#fff"/><path d="${path}" fill="${HEXFIELD.VOID}"/></svg>`;
  return sharp(jpeg).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 90 }).toBuffer();
}

// Draws the cover (4:5, the title as its headline) and the Story picture
// (9:16, with the link on it) from the page's photo. Returns the new paths.
export async function drawPayPagePictures(link) {
  if (!link.page_photo_path) return { page_cover_path: null, page_story_image_path: null };
  const res = await fetch(publicUrl(link.page_photo_path));
  if (!res.ok) throw new Error('Could not read the page photo');
  const photo = Buffer.from(await res.arrayBuffer());
  const item = { path: link.page_photo_path, kind: 'image' };
  const cover = await renderCover(await preparePhoto(photo, item, { maxWidth: 1080 }), link.page_title || '', { maxWidth: 1080 });
  const story = await withLinkPill(await renderStoryFrame(photo, link.page_title || '', { first: true, item }), payLinkUrl(link.token));
  return {
    page_cover_path: await upload(link.id, 'cover', cover),
    page_story_image_path: await upload(link.id, 'story', story),
  };
}

// The rescuer's Instagram, fetched again if it's older than 12 hours (or
// force). Saves and returns the profile, or null.
export async function refreshPayPageInstagram(link, { force = false } = {}) {
  if (!link.instagram_handle) {
    if (link.page_instagram) await supabaseAdmin.from('client_payment_links').update({ page_instagram: null, page_instagram_fetched_at: null }).eq('id', link.id);
    return null;
  }
  const fresh = link.page_instagram_fetched_at && Date.now() - Date.parse(link.page_instagram_fetched_at) < INSTAGRAM_REFRESH_MS;
  if (fresh && !force && link.page_instagram?.username === link.instagram_handle) return link.page_instagram;
  const profile = await fetchInstagramProfile(link.instagram_handle);
  // A failed fetch keeps what was there (and tries again next time).
  await supabaseAdmin
    .from('client_payment_links')
    .update({ ...(profile ? { page_instagram: profile } : {}), page_instagram_fetched_at: new Date().toISOString() })
    .eq('id', link.id);
  return profile || link.page_instagram || null;
}

// The publish sweep's share: pages whose Instagram is due a refresh.
export async function refreshDuePayPages(limit = 3) {
  const before = new Date(Date.now() - INSTAGRAM_REFRESH_MS).toISOString();
  const { data } = await supabaseAdmin
    .from('client_payment_links')
    .select('id, instagram_handle, page_instagram, page_instagram_fetched_at')
    .eq('active', true)
    .eq('page_enabled', true)
    .not('instagram_handle', 'is', null)
    .or(`page_instagram_fetched_at.is.null,page_instagram_fetched_at.lt.${before}`)
    .limit(limit);
  for (const link of data || []) await refreshPayPageInstagram(link, { force: true });
  return { refreshed: (data || []).length };
}
