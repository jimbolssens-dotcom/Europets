// lib/socialReelPlan.js
// The plan for a Social Reel made from a post's photos and video clips
// (lib/socialReel.js, migration 207): which files go in and in what order,
// how long each one shows, the ffmpeg filter graph that zooms the photos,
// plays the clips, crossfades and lays the text over them, and the key that
// tells whether a made Reel still matches the post. Pure, so it can be
// tested (tests/social-reel.test.mjs).

import { cleanHeadline } from './socialCoverLayout.js';

export const REEL_FPS = 24;
export const REEL_W = 1080;
export const REEL_H = 1920;
export const REEL_MAX_ITEMS = 6;
export const REEL_FADE = 0.5; // the crossfade between files
export const REEL_END = 2; // the Europets end card

export const REEL_MUSIC = [
  { key: 'sunny', label: 'Sunny' },
  { key: 'gentle', label: 'Gentle' },
  { key: 'bouncy', label: 'Bouncy' },
  { key: 'none', label: '🔇', title: 'No music' },
];
export const REEL_MUSIC_KEYS = REEL_MUSIC.map((m) => m.key);

// Seconds per photo: fewer files get longer each, so a Reel is about 8 to
// 15 seconds whatever goes in (render time grows with length, and the
// function has a minute). A first photo gets a little extra to read the
// headline.
const PER_PHOTO = { 1: 5, 2: 3.6, 3: 3.2, 4: 2.8, 5: 2.5, 6: 2.2 };
const FIRST_EXTRA = 0.5;
// Video clips: up to CLIP_MAX seconds each, from just after the start (a
// phone's first moment is often the tap), never under CLIP_MIN unless the
// clip itself is shorter, and the whole Reel kept to MAX_TOTAL.
export const CLIP_MAX = 4.5;
const CLIP_MIN = 2;
export const CLIP_SKIP = 0.3;
const MAX_TOTAL = 13;

// The files that go in, in posting order (cover first): media indexes.
export function reelItems(post) {
  const media = Array.isArray(post?.media) ? post.media : [];
  const usable = media.map((m, i) => ({ m, i })).filter(({ m }) => m && !m.excluded && (m.kind === 'image' || m.kind === 'video'));
  const cover = usable.filter(({ i }) => i === post.cover_index);
  const rest = usable.filter(({ i }) => i !== post.cover_index);
  return [...cover, ...rest].slice(0, REEL_MAX_ITEMS).map(({ i }) => i);
}

// When each file starts and how long it shows, where each clip is cut from,
// the end card, and the total. kinds: 'image' | 'video' per file; clipLengths:
// each video's own length in seconds, where known (an estimate otherwise).
export function reelTimeline(kinds, clipLengths = []) {
  const list = (kinds.length ? kinds : ['image']).slice(0, REEL_MAX_ITEMS);
  const n = list.length;
  const starts = list.map(() => 0);
  const durations = list.map((kind, k) => {
    if (kind !== 'video') return PER_PHOTO[n] + (k === 0 ? FIRST_EXTRA : 0);
    const cut = clipCut(Number(clipLengths[k]) > 0 ? Number(clipLengths[k]) : CLIP_MAX + CLIP_SKIP);
    starts[k] = cut.start;
    return cut.seconds;
  });
  // Too long: shorten the clips, as evenly as they allow.
  const sum = () => durations.reduce((a, b) => a + b, 0) + REEL_END - REEL_FADE * n;
  for (let guard = 0; sum() > MAX_TOTAL + 0.001 && guard < 20; guard++) {
    const over = sum() - MAX_TOTAL;
    const shrinkable = durations.map((d, k) => (list[k] === 'video' && d > CLIP_MIN ? k : -1)).filter((k) => k >= 0);
    if (!shrinkable.length) break;
    const each = over / shrinkable.length;
    for (const k of shrinkable) durations[k] = Math.max(CLIP_MIN, durations[k] - each);
  }
  // Rounded down, so shortening never ends up a hair over MAX_TOTAL.
  for (let k = 0; k < n; k++) durations[k] = Math.floor(durations[k] * 1000) / 1000;
  // xfade offsets: each file starts fading in REEL_FADE before the last ends.
  const offsets = [];
  let t = 0;
  for (let k = 0; k < n; k++) {
    t += durations[k];
    offsets.push(Number((t - REEL_FADE * (k + 1)).toFixed(3)));
  }
  const total = Number((t + REEL_END - REEL_FADE * n).toFixed(3));
  return { durations, starts, offsets, total };
}

function frames(seconds) {
  return Math.round(seconds * REEL_FPS);
}

// A still image held for `seconds`: decoded once, then repeated (decoding
// it again for every frame is what makes ffmpeg slow).
function hold(seconds) {
  return `loop=loop=${frames(seconds) - 1}:size=1:start=0,setpts=N/${REEL_FPS}/TB`;
}

// The ffmpeg filter graph. Inputs, in order: the n files (photos already
// sized a little over 1080x1920, so there's room to zoom; clips already cut
// to their part with -ss/-t), the n text overlays (transparent PNGs,
// 1080x1920), the end card, then the music if any. Photos zoom in and out in
// turn; clips fill the frame and play. The first file's text is there from
// the first frame (it's the thumbnail), the others fade in. The clips' own
// sound isn't used: the backing track plays under the whole Reel.
export function reelFilterGraph(kinds, clipLengths = [], { music = true } = {}) {
  const timeline = reelTimeline(kinds, clipLengths);
  const { durations, offsets, total } = timeline;
  const n = durations.length;
  const parts = [];
  for (let k = 0; k < n; k++) {
    const d = durations[k];
    if (kinds[k] === 'video') {
      parts.push(
        `[${k}:v]fps=${REEL_FPS},scale=${REEL_W}:${REEL_H}:force_original_aspect_ratio=increase,crop=${REEL_W}:${REEL_H},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS[p${k}]`
      );
    } else {
      const step = (0.11 / frames(d)).toFixed(5);
      const zoom = k % 2 === 0 ? `1+${step}*on` : `1.11-${step}*on`;
      parts.push(
        `[${k}:v]format=yuv420p,${hold(d)},zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${REEL_W}x${REEL_H}:fps=${REEL_FPS},setsar=1[p${k}]`
      );
    }
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
  return { graph: parts.join(';'), ...timeline };
}

// "2 photos + 1 video", for the page.
export function reelContents(post, items = reelItems(post)) {
  const media = Array.isArray(post?.media) ? post.media : [];
  const videos = items.filter((i) => media[i]?.kind === 'video').length;
  const photos = items.length - videos;
  return [photos && `${photos} photo${photos === 1 ? '' : 's'}`, videos && `${videos} video${videos === 1 ? '' : 's'}`].filter(Boolean).join(' + ');
}

// The text on each file of the Reel: the cover headline on the first, the
// line for that file on the others.
export function reelTexts(post, photos = reelItems(post)) {
  const lines = Array.isArray(post?.reel_lines) ? post.reel_lines : [];
  return photos.map((i, k) => (k === 0 ? String(post.cover_headline || '') : String(lines[i] || '')).trim());
}

// What the Reel is made from. A made Reel whose key differs is out of date.
export function reelKey(post) {
  const photos = reelItems(post);
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
  if (reelItems(post).length === 0) return 'A Reel needs at least one photo or video.';
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

// Where a clip's part starts and how much of it to prepare (lib/socialReel.js,
// prepareReelClip), from the clip's own length: the most it could ever show.
export function clipCut(length) {
  const start = length > CLIP_MAX + CLIP_SKIP ? CLIP_SKIP : 0;
  return { start, seconds: Math.max(1, Math.min(CLIP_MAX, length - start)) };
}

// A prepared clip (media[i].reel_clip) is only used while it's for the same
// file, and only one this post made.
export function preparedClip(item, postId) {
  const clip = item?.reel_clip;
  if (!clip || clip.source !== item.path || typeof clip.path !== 'string' || !clip.path.startsWith(`social/${postId}/`)) return null;
  return Number(clip.length) > 0 ? clip : null;
}
