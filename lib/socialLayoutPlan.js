// lib/socialLayoutPlan.js
// Layouts for a Social post that goes out as photos (migration 211,
// social_posts.layout): a Before / After (two photos side by side, labelled)
// or a Collage (2 to 4 photos in one picture). The layout picture is drawn
// by lib/socialLayout.js and goes first, with the cover text and the logo on
// it; the photos not in it follow as the rest of the carousel. Pure, so it
// can be tested (tests/social-layout.test.mjs).

import { touchUpKey } from './socialTouchUpPlan.js';

export const LAYOUTS = [
  { key: 'before_after', label: 'Before / After', min: 2, max: 2 },
  { key: 'collage', label: 'Collage', min: 2, max: 4 },
];

// The layout picture's size: Instagram's tallest feed shape, 4:5.
export const LAYOUT_W = 1080;
export const LAYOUT_H = 1350;
export const LAYOUT_GAP = 8;

function spec(kind) {
  return LAYOUTS.find((l) => l.key === kind) || null;
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
  return { kind: s.key, items: items.slice(0, s.max) };
}

// The photos the post's layout uses, or null when it has none that works:
// set to go out as photos, with enough photos that aren't left out.
export function layoutItems(post) {
  if ((post?.post_as || 'photos') !== 'photos') return null;
  const s = spec(post?.layout?.kind);
  if (!s) return null;
  const media = Array.isArray(post.media) ? post.media : [];
  const items = (post.layout.items || []).filter((i) => media[i]?.kind === 'image' && !media[i].excluded).slice(0, s.max);
  return items.length >= s.min ? items : null;
}

// Why a post with a layout can't be approved yet, or null.
export function layoutBlocker(post) {
  if ((post?.post_as || 'photos') !== 'photos') return null;
  const s = spec(post?.layout?.kind);
  if (!s || layoutItems(post)) return null;
  return s.key === 'before_after' ? 'Pick the before and the after photo for the Before / After.' : 'Pick at least 2 photos for the collage.';
}

// Where each photo goes in the W x H picture: { left, top, width, height }.
// Before / After side by side; a collage of 2 stacked, 3 as one wide on top
// and two below, 4 as a grid of four.
export function layoutCells(kind, count, W = LAYOUT_W, H = LAYOUT_H, gap = LAYOUT_GAP) {
  const half = (len) => [Math.floor((len - gap) / 2), Math.ceil((len - gap) / 2)];
  const [w1, w2] = half(W);
  const [h1, h2] = half(H);
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
