// lib/socialTouchUpPlan.js
// Touch-ups staff can make to each photo of a Social post on the draft
// (app/(admin)/social/[id]): a look (auto-fix, warm, bright...), the spot to
// keep in frame when it's cropped, a speech bubble from the pet pointing at
// where it is in the photo, and a sticker in the corner. Kept on the post's
// media item (look, focus, bubble, sticker), so no migration. Drawn by
// lib/socialTouchUp.js for the feed photo, the Reel and the Story alike.
// Pure, so it can be tested (tests/social-touchup.test.mjs).

import { cleanHeadline } from './socialCoverLayout.js';
import { fitInstagramRatio } from './socialPublishPlan.js';

export const LOOKS = [
  { key: 'auto', label: '✨ Auto-fix' },
  { key: 'warm', label: 'Warm' },
  { key: 'bright', label: 'Bright' },
  { key: 'soft', label: 'Soft' },
  { key: 'bw', label: 'B&W' },
];
const LOOK_KEYS = LOOKS.map((l) => l.key);

// Text stickers are two short lines on the app's hexagon badge.
export const STICKERS = [
  { key: 'paws', label: '🐾', title: 'Paw prints' },
  { key: 'hearts', label: '❤️', title: 'Hearts' },
  { key: 'brave', label: 'Brave patient', lines: ['Brave', 'patient'] },
  { key: 'home', label: 'Going home', lines: ['Going', 'home'] },
  { key: 'birthday', label: 'Birthday', lines: ['Happy', 'birthday'] },
];
const STICKER_KEYS = STICKERS.map((s) => s.key);

function cleanPoint(p) {
  const x = Number(p?.x);
  const y = Number(p?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const c = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  return { x: c(x), y: c(y) };
}

// The touch-up fields of a media item, from whatever the page sent: only
// what's valid. focus and the bubble's point are fractions of the upright
// photo (0 to 1 from the top left).
export function cleanTouchUp(m) {
  const out = {
    look: LOOK_KEYS.includes(m?.look) ? m.look : null,
    focus: m?.focus ? cleanPoint(m.focus) : null,
    bubble: null,
    sticker: STICKER_KEYS.includes(m?.sticker) ? m.sticker : null,
  };
  const text = typeof m?.bubble?.text === 'string' ? cleanHeadline(m.bubble.text) : '';
  if (text) out.bubble = { text, ...(cleanPoint(m.bubble) || { x: 0.5, y: 0.5 }) };
  return out;
}

// What a photo's touch-ups are, as a string: empty when it has none, so a
// photo nobody touched keys the same as before touch-ups existed.
export function touchUpKey(item) {
  const t = cleanTouchUp(item);
  if (!t.look && !t.focus && !t.bubble && !t.sticker) return '';
  return JSON.stringify(t);
}

// Touch-ups from the preview's query string (lib: the cover route), for
// the live preview of unsaved changes: look, fx/fy, bt/bx/by, st.
export function touchUpFromQuery(params) {
  const get = (k) => (params.has(k) ? params.get(k) : null);
  return cleanTouchUp({
    look: get('look'),
    focus: get('fx') !== null ? { x: get('fx'), y: get('fy') } : null,
    bubble: get('bt') ? { text: get('bt'), x: get('bx'), y: get('by') } : null,
    sticker: get('st'),
  });
}

// The spot the crop centres on: where staff said, else where the bubble
// points (that's where the pet is), else null (the caller picks).
export function cropFocus(item) {
  const t = cleanTouchUp(item);
  if (t.focus) return t.focus;
  if (t.bubble) return { x: t.bubble.x, y: t.bubble.y };
  return null;
}

// A crop box of the given size inside width x height, centred on focus as
// far as the edges allow.
function placeBox(width, height, w, h, focus) {
  const left = Math.round(Math.min(width - w, Math.max(0, focus.x * width - w / 2)));
  const top = Math.round(Math.min(height - h, Math.max(0, focus.y * height - h / 2)));
  return { left, top, width: w, height: h };
}

// The feed photo: inside Instagram's ratios as before (centre-cropped),
// but around the focus when there is one.
export function feedCrop(width, height, focus) {
  const box = fitInstagramRatio(width, height);
  return focus ? placeBox(width, height, box.width, box.height, focus) : box;
}

// A full frame of W x H (a Reel or Story photo) cut from the photo, around
// the focus. Null without one: the caller crops around what matters.
export function fillCrop(width, height, W, H, focus) {
  if (!focus) return null;
  const wide = width / height > W / H;
  const w = wide ? Math.round((height * W) / H) : width;
  const h = wide ? height : Math.round((width * H) / W);
  return placeBox(width, height, w, h, focus);
}

// Where a point of the whole photo lands in the crop, as fractions of it,
// kept a little in from the edges.
export function pointInCrop(point, box, width, height) {
  const c = (v) => Math.min(0.95, Math.max(0.05, v));
  return { x: c((point.x * width - box.left) / box.width), y: c((point.y * height - box.top) / box.height) };
}

// Where the speech bubble goes in a W x H frame, pointing at the pet at
// (px, py) px: above it when there's room (below otherwise), off to the
// side towards the middle, and kept inside the margins and under `top`.
// boxW, boxH: the bubble's size. Returns its box and the tail's tip.
export function bubbleLayout(W, H, px, py, boxW, boxH, { top = 0 } = {}) {
  const margin = Math.round(W * 0.04);
  const gap = Math.round(W * 0.09); // between the bubble and the pet
  const tipOff = Math.round(W * 0.025); // the tip stops just short of it
  const minTop = Math.max(margin, top);
  const above = py - gap - boxH >= minTop;
  const y = above ? py - gap - boxH : Math.min(H - margin - boxH, py + gap);
  // Off-centre towards the middle, so the bubble sits beside the face.
  const lean = px < W / 2 ? 0.3 : 0.7;
  const x = Math.round(Math.min(W - margin - boxW, Math.max(margin, px - boxW * lean)));
  return {
    x,
    y: Math.round(Math.max(minTop, y)),
    above,
    tip: { x: Math.round(px), y: Math.round(above ? py - tipOff : py + tipOff) },
  };
}
