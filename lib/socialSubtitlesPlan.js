// lib/socialSubtitlesPlan.js
// Subtitles on a Social Reel's video clips (lib/socialReel.js): what's said
// in the part of the clip the Reel plays, transcribed with word timings
// (lib/socialSubtitles.js), shown a few words at a time with the word being
// said in pink, since most people watch Reels with the sound off. Kept on
// the clip's media item as `subtitles` (no migration):
// { on, source, start, words: [{ w, s, e }] }, s and e in seconds from the
// start of the clip's part. Pure, so it can be tested
// (tests/social-subtitles.test.mjs).

import { clipCut } from './socialReelPlan.js';

const MAX_WORDS = 4;
const MAX_CHARS = 24;
const BREAK_GAP = 0.6; // a pause this long starts a new group of words
const HOLD = 0.5; // a group stays up this long after its last word

function cleanWord(w) {
  return String(w || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// The subtitles of a media item from whatever the page sent: only what's
// valid, words in order inside the clip's part, at most 80 of them.
export function cleanSubtitles(m) {
  const sub = m?.subtitles;
  if (!sub || typeof sub !== 'object') return null;
  const words = (Array.isArray(sub.words) ? sub.words : [])
    .map((x) => ({ w: cleanWord(x?.w), s: Number(x?.s), e: Number(x?.e) }))
    .filter((x) => x.w && Number.isFinite(x.s) && Number.isFinite(x.e) && x.s >= 0 && x.e >= x.s && x.s < 60)
    .sort((a, b) => a.s - b.s)
    .slice(0, 80)
    .map((x) => ({ w: x.w, s: Math.round(x.s * 1000) / 1000, e: Math.round(x.e * 1000) / 1000 }));
  return {
    on: !!sub.on,
    source: typeof sub.source === 'string' ? sub.source : null,
    start: Number.isFinite(Number(sub.start)) ? Number(sub.start) : 0,
    words,
  };
}

// Subtitles that are for this file and this part of it, or null (not
// transcribed yet, or the clip changed).
export function currentSubtitles(item, clipLength) {
  const sub = cleanSubtitles(item);
  if (!sub || sub.source !== item?.path) return null;
  if (Number(clipLength) > 0 && Math.abs(clipCut(Number(clipLength)).start - sub.start) > 0.01) return null;
  return sub;
}

// Whether the Reel shows subtitles on this clip: switched on and
// transcribed, with something said.
export function subtitlesShown(item, clipLength) {
  const sub = currentSubtitles(item, clipLength);
  return !!(item?.kind === 'video' && sub?.on && sub.words.length);
}

export function subtitlesText(item) {
  return (cleanSubtitles(item)?.words || []).map((x) => x.w).join(' ');
}

// Staff edited the words: the same number of words keep their timings;
// otherwise the new words share the time the old ones were said in,
// evenly.
export function retimeWords(words, text) {
  const next = String(text || '').split(/\s+/).map(cleanWord).filter(Boolean);
  if (!next.length) return [];
  if (next.length === words.length) return words.map((x, k) => ({ ...x, w: next[k] }));
  const from = words.length ? words[0].s : 0;
  const to = words.length ? words[words.length - 1].e : Math.max(1, next.length * 0.35);
  const each = (to - from) / next.length;
  return next.map((w, k) => ({ w, s: Math.round((from + each * k) * 1000) / 1000, e: Math.round((from + each * (k + 1)) * 1000) / 1000 }));
}

// The words in groups of a few, broken at pauses and full stops.
export function subtitleGroups(words) {
  const groups = [];
  let cur = [];
  for (const x of words) {
    const prev = cur[cur.length - 1];
    const chars = cur.reduce((a, y) => a + y.w.length + 1, 0) + x.w.length;
    if (cur.length && (cur.length >= MAX_WORDS || chars > MAX_CHARS || x.s - prev.e > BREAK_GAP || /[.!?]$/.test(prev.w))) {
      groups.push(cur);
      cur = [];
    }
    cur.push(x);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

// What's on screen over a clip shown for `duration` seconds, from 0 to the
// end with no gaps: [{ from, to, group, word }], group null for no
// subtitle, word the one being said (the last one said while it holds).
export function subtitleTimeline(words, duration) {
  const segments = [];
  let t = 0;
  const push = (to, group, word) => {
    const end = Math.min(duration, to);
    if (end - t < 0.04) return;
    segments.push({ from: Math.round(t * 1000) / 1000, to: Math.round(end * 1000) / 1000, group, word });
    t = end;
  };
  const groups = subtitleGroups(words.filter((x) => x.s < duration));
  groups.forEach((g, gi) => {
    const next = groups[gi + 1];
    if (g[0].s > t) push(g[0].s, null, null);
    g.forEach((x, wi) => push(wi + 1 < g.length ? g[wi + 1].s : x.s + Math.max(0.2, x.e - x.s), gi, wi));
    push(Math.min(next ? next[0].s : Infinity, t + HOLD), gi, g.length - 1);
  });
  push(duration, null, null);
  return { groups, segments };
}
