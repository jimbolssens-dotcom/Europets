// lib/socialReelPlan.js
// The plan for a Social Reel made from a post's photos (lib/socialReel.js,
// migration 207): which photos go in and in what order, how long each one
// shows, the ffmpeg filter graph that zooms, crossfades and lays the text
// over them, and the key that tells whether a made Reel still matches the
// post. Pure, so it can be tested (tests/social-reel.test.mjs).

import { cleanHeadline } from './socialCoverLayout.js';

export const REEL_FPS = 24;
export const REEL_W = 1080;
export const REEL_H = 1920;
export const REEL_MAX_PHOTOS = 6;
export const REEL_FADE = 0.5; // the crossfade between photos
export const REEL_END = 2; // the Europets end card

export const REEL_MUSIC = [
  { key: 'sunny', label: 'Sunny' },
  { key: 'gentle', label: 'Gentle' },
  { key: 'bouncy', label: 'Bouncy' },
  { key: 'none', label: '🔇', title: 'No music' },
];
export const REEL_MUSIC_KEYS = REEL_MUSIC.map((m) => m.key);

// Seconds per photo: fewer photos get longer each, so a Reel is about 8 to
// 13 seconds whatever goes in (render time grows with length, and the
// function has a minute). The first gets a little extra to read the headline.
const PER_PHOTO = { 1: 5, 2: 3.6, 3: 3.2, 4: 2.8, 5: 2.5, 6: 2.2 };
const FIRST_EXTRA = 0.5;

// The photos that go in, in posting order (cover first): media indexes.
export function reelPhotos(post) {
  const media = Array.isArray(post?.media) ? post.media : [];
  const usable = media.map((m, i) => ({ m, i })).filter(({ m }) => m && !m.excluded && m.kind === 'image');
  const cover = usable.filter(({ i }) => i === post.cover_index);
  const rest = usable.filter(({ i }) => i !== post.cover_index);
  return [...cover, ...rest].slice(0, REEL_MAX_PHOTOS).map(({ i }) => i);
}

// When each photo starts and how long it shows, the end card, and the total.
export function reelTimeline(count) {
  const n = Math.max(1, Math.min(REEL_MAX_PHOTOS, count));
  const durations = Array.from({ length: n }, (_, k) => PER_PHOTO[n] + (k === 0 ? FIRST_EXTRA : 0));
  // xfade offsets: each clip starts fading in REEL_FADE before the last ends.
  const offsets = [];
  let t = 0;
  for (let k = 0; k < n; k++) {
    t += durations[k];
    offsets.push(Number((t - REEL_FADE * (k + 1)).toFixed(3)));
  }
  const total = Number((t + REEL_END - REEL_FADE * n).toFixed(3));
  return { durations, offsets, total };
}

function frames(seconds) {
  return Math.round(seconds * REEL_FPS);
}

// A still image held for `seconds`: decoded once, then repeated (decoding
// it again for every frame is what makes ffmpeg slow).
function hold(seconds) {
  return `loop=loop=${frames(seconds) - 1}:size=1:start=0,setpts=N/${REEL_FPS}/TB`;
}

// The ffmpeg filter graph. Inputs, in order: the n photos (already sized a
// little over 1080x1920, so there's room to zoom), the n text overlays
// (transparent PNGs, 1080x1920), the end card, then the music if any.
// Photos zoom in and out in turn; the first photo's text is there from the
// first frame (it's the thumbnail), the others fade in.
export function reelFilterGraph(count, { music = true } = {}) {
  const { durations, offsets, total } = reelTimeline(count);
  const n = durations.length;
  const parts = [];
  for (let k = 0; k < n; k++) {
    const d = durations[k];
    const step = (0.11 / frames(d)).toFixed(5);
    const zoom = k % 2 === 0 ? `1+${step}*on` : `1.11-${step}*on`;
    parts.push(
      `[${k}:v]format=yuv420p,${hold(d)},zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${REEL_W}x${REEL_H}:fps=${REEL_FPS},setsar=1[p${k}]`
    );
    const textIn = k === 0 ? '' : ',fade=t=in:st=0.35:d=0.4:alpha=1';
    parts.push(`[${n + k}:v]format=rgba,${hold(d)}${textIn}[t${k}]`);
    parts.push(`[p${k}][t${k}]overlay=0:0:shortest=1,format=yuv420p[s${k}]`);
  }
  parts.push(`[${2 * n}:v]scale=${REEL_W}:${REEL_H},format=yuv420p,${hold(REEL_END)},setsar=1[end]`);
  let last = 's0';
  for (let k = 1; k <= n; k++) {
    const next = k < n ? `s${k}` : 'end';
    const out = k < n ? `x${k}` : 'v';
    parts.push(`[${last}][${next}]xfade=transition=fade:duration=${REEL_FADE}:offset=${offsets[k - 1]}[${out}]`);
    last = out;
  }
  if (music) {
    parts.push(`[${2 * n + 1}:a]atrim=0:${total},asetpts=N/SR/TB,afade=t=in:d=0.3,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5[a]`);
  }
  return { graph: parts.join(';'), total };
}

// The text on each photo of the Reel: the cover headline on the first, the
// line for that photo on the others.
export function reelTexts(post, photos = reelPhotos(post)) {
  const lines = Array.isArray(post?.reel_lines) ? post.reel_lines : [];
  return photos.map((i, k) => (k === 0 ? String(post.cover_headline || '') : String(lines[i] || '')).trim());
}

// What the Reel is made from. A made Reel whose key differs is out of date.
export function reelKey(post) {
  const photos = reelPhotos(post);
  const media = Array.isArray(post?.media) ? post.media : [];
  return JSON.stringify({
    photos: photos.map((i) => media[i].path),
    texts: reelTexts(post, photos),
    music: post?.reel_music || 'sunny',
  });
}

// Why a post set to go out as a Reel can't be approved yet, or null.
export function reelBlocker(post) {
  if (post?.post_as !== 'reel') return null;
  if (reelPhotos(post).length === 0) return 'A Reel needs at least one photo.';
  if (!post.reel?.path) return 'Make the Reel first (🎬 Make the Reel).';
  if (post.reel.key !== reelKey(post)) return 'Something changed since the Reel was made: tap 🎬 Make it again.';
  return null;
}

// The Reel fields staff can change, from a request body: only what's there
// and valid. reel_lines is one line (or null) per file, by media index.
export function cleanReelEdits(body, media) {
  const edits = {};
  if (typeof body?.cover_headline === 'string') edits.cover_headline = cleanHeadline(body.cover_headline) || null;
  if (Array.isArray(body?.reel_lines)) {
    const count = Array.isArray(media) ? media.length : 0;
    edits.reel_lines = Array.from({ length: count }, (_, i) => (typeof body.reel_lines[i] === 'string' ? cleanHeadline(body.reel_lines[i]) || null : null));
  }
  if (REEL_MUSIC_KEYS.includes(body?.reel_music)) edits.reel_music = body.reel_music;
  if (body?.post_as === 'photos' || body?.post_as === 'reel') edits.post_as = body.post_as;
  return edits;
}
