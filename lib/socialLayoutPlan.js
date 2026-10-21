// lib/socialLayoutPlan.js
// Layouts for a Social post that goes out as photos (migration 211,
// social_posts.layout): a Before / After (two photos side by side, labelled),
// a Collage (2 to 4 photos in one picture) or Patient of the week (one
// photo with a badge, the pet's name and the cover text), or a Tip card (no
// photo: a title and a few points on the app's dark honeycomb, written by
// the AI from a topic, lib/socialDraft.js). The layout picture is drawn by
// lib/socialLayout.js and goes first, with the cover text and the logo on
// it; the photos not in it follow as the rest of the carousel. Pure, so it
// can be tested (tests/social-layout.test.mjs).

import { touchUpKey } from './socialTouchUpPlan.js';
import { cleanHeadline } from './socialCoverLayout.js';

// The ones staff pick on a draft with photos.
export const LAYOUTS = [
  { key: 'before_after', label: 'Before / After', min: 2, max: 2 },
  { key: 'collage', label: 'Collage', min: 2, max: 4 },
  { key: 'potw', label: '⭐ Patient', min: 1, max: 1 },
];
// A Tip card is chosen when the post is started (app/(admin)/social/new).
const TIP = { key: 'tip', label: 'Tip card', min: 0, max: 0 };
export const TIP_MAX_POINTS = 5;
const POINT_MAX_CHARS = 90;
const NAME_MAX_CHARS = 24;

// The layout picture's size: Instagram's tallest feed shape, 4:5.
export const LAYOUT_W = 1080;
export const LAYOUT_H = 1350;
export const LAYOUT_GAP = 8;

function spec(kind) {
  return [...LAYOUTS, TIP].find((l) => l.key === kind) || null;
}

export function isTipCard(post) {
  return post?.layout?.kind === 'tip';
}

function cleanPoint(text) {
  const plain = String(text || '').replace(/\s*[\u2013\u2014]\s*/g, ', ').replace(/\s+/g, ' ').trim();
  if (plain.length <= POINT_MAX_CHARS) return plain;
  const cut = plain.slice(0, POINT_MAX_CHARS + 1);
  return cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : POINT_MAX_CHARS).replace(/[\s,.;:]+$/, '');
}

// The layout from a request body: a known kind and the photos in it (media
// indexes, in order: before then after), or null for none. Only photos,
// each once, at most as many as the layout takes.
export function cleanLayout(layout, media) {
  const s = spec(layout?.kind);
  if (!s || !Array.isArray(layout.items)) return null;
  const list = Array.isArray(media) ? media : [];
  const items = [];
  for (const i of layout.items) {
    if (Number.isInteger(i) && list[i]?.kind === 'image' && !items.includes(i)) items.push(i);
  }
  const out = { kind: s.key, items: items.slice(0, s.max) };
  // Patient of the week: the pet's name, big. A Tip card: its title and
  // points (empty ones kept while staff type, dropped when it's drawn).
  if (s.key === 'potw') out.name = cleanHeadline(layout.name).slice(0, NAME_MAX_CHARS).trim();
  if (s.key === 'tip') {
    out.title = cleanHeadline(layout.title);
    out.points = (Array.isArray(layout.points) ? layout.points : []).slice(0, TIP_MAX_POINTS).map(cleanPoint);
  }
  return out;
}

// A Tip card's points as drawn: the ones with words in them.
export function tipPoints(layout) {
  return (layout?.points || []).map(cleanPoint).filter(Boolean);
}

// The photos the post's layout uses, or null when it has none that works:
// set to go out as photos, with enough photos that aren't left out.
export function layoutItems(post) {
  if ((post?.post_as || 'photos') !== 'photos') return null;
  const s = spec(post?.layout?.kind);
  if (!s) return null;
  // A Tip card uses no photos: it only needs its title.
  if (s.key === 'tip') return cleanHeadline(post.layout.title) ? [] : null;
  const media = Array.isArray(post.media) ? post.media : [];
  const items = (post.layout.items || []).filter((i) => media[i]?.kind === 'image' && !media[i].excluded).slice(0, s.max);
  return items.length >= s.min ? items : null;
}

// Why a post with a layout can't be approved yet, or null.
export function layoutBlocker(post) {
  if ((post?.post_as || 'photos') !== 'photos') return null;
  const s = spec(post?.layout?.kind);
  if (!s || layoutItems(post)) return null;
  if (s.key === 'tip') return 'Give the tip card a title.';
  if (s.key === 'potw') return 'Pick the photo for Patient of the week.';
  return s.key === 'before_after' ? 'Pick the before and the after photo for the Before / After.' : 'Pick at least 2 photos for the collage.';
}

// Where each photo goes in the W x H picture: { left, top, width, height }.
// Before / After side by side; a collage of 2 stacked, 3 as one wide on top
// and two below, 4 as a grid of four.
export function layoutCells(kind, count, W = LAYOUT_W, H = LAYOUT_H, gap = LAYOUT_GAP) {
  const half = (len) => [Math.floor((len - gap) / 2), Math.ceil((len - gap) / 2)];
  const [w1, w2] = half(W);
  const [h1, h2] = half(H);
  if (kind === 'potw' || count <= 1) return [{ left: 0, top: 0, width: W, height: H }];
  if (kind === 'before_after') {
    return [
      { left: 0, top: 0, width: w1, height: H },
      { left: w1 + gap, top: 0, width: w2, height: H },
    ];
  }
  if (count <= 2) {
    return [
      { left: 0, top: 0, width: W, height: h1 },
      { left: 0, top: h1 + gap, width: W, height: h2 },
    ];
  }
  if (count === 3) {
    const topH = Math.round((H - gap) * 0.58);
    const bottomH = H - gap - topH;
    return [
      { left: 0, top: 0, width: W, height: topH },
      { left: 0, top: topH + gap, width: w1, height: bottomH },
      { left: w1 + gap, top: topH + gap, width: w2, height: bottomH },
    ];
  }
  return [
    { left: 0, top: 0, width: w1, height: h1 },
    { left: w1 + gap, top: 0, width: w2, height: h1 },
    { left: 0, top: h1 + gap, width: w1, height: h2 },
    { left: w1 + gap, top: h1 + gap, width: w2, height: h2 },
  ];
}

// What the layout picture is drawn from, so one already drawn is reused and
// a changed one drawn again.
export function layoutKey(post, items = layoutItems(post)) {
  if (!items) return '';
  const media = post.media;
  return JSON.stringify({
    kind: post.layout.kind,
    photos: items.map((i) => [media[i].path, touchUpKey(media[i])]),
    headline: String(post.cover_headline || ''),
    ...(post.layout.kind === 'potw' ? { name: post.layout.name || '' } : {}),
    ...(post.layout.kind === 'tip' ? { title: post.layout.title || '', points: tipPoints(post.layout) } : {}),
  });
}

// The photos posted after the layout picture: the rest, cover first.
export function afterLayout(post, items = layoutItems(post) || []) {
  const media = Array.isArray(post?.media) ? post.media : [];
  const order = [post.cover_index, ...media.map((_, i) => i).filter((i) => i !== post.cover_index)];
  return order.filter((i) => media[i] && !media[i].excluded && !items.includes(i));
}

// The photos a new layout starts with: the first ones not left out, cover
// first.
export function defaultLayoutItems(post, kind) {
  const s = spec(kind);
  if (!s) return [];
  const media = Array.isArray(post?.media) ? post.media : [];
  const order = [post.cover_index, ...media.map((_, i) => i).filter((i) => i !== post.cover_index)];
  return order.filter((i) => media[i]?.kind === 'image' && !media[i].excluded).slice(0, s.key === 'collage' ? Math.min(4, s.max) : s.max);
}
