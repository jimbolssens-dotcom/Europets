import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSubtitles, currentSubtitles, subtitlesShown, retimeWords, subtitleGroups, subtitleTimeline } from '../lib/socialSubtitlesPlan.js';
import { reelKey, reelFilterGraph } from '../lib/socialReelPlan.js';

const said = (text, gap = 0.35) => text.split(' ').map((w, k) => ({ w, s: 0.2 + k * gap, e: 0.2 + k * gap + 0.3 }));
const clip = (words, extra = {}) => ({ path: 'v.mp4', kind: 'video', subtitles: { on: true, source: 'v.mp4', start: 0.3, words, ...extra } });

test('only valid words are kept, in order', () => {
  const sub = cleanSubtitles({ subtitles: { on: 1, source: 'v', start: 0.3, words: [{ w: 'b', s: 1, e: 1.2 }, { w: ' a ', s: 0.5, e: 0.7 }, { w: '', s: 1, e: 2 }, { w: 'x', s: 2, e: 1 }] } });
  assert.deepEqual(sub, { on: true, source: 'v', start: 0.3, words: [{ w: 'a', s: 0.5, e: 0.7 }, { w: 'b', s: 1, e: 1.2 }] });
  assert.equal(cleanSubtitles({}), null);
});

test('subtitles only show while they are for this clip and this part of it', () => {
  const m = clip(said('Good boy'));
  assert.ok(subtitlesShown(m, 12));
  assert.equal(currentSubtitles({ ...m, path: 'other.mp4' }, 12), null);
  // A clip under 4.8 seconds plays from the start, so a cut from 0.3 is stale.
  assert.equal(currentSubtitles(m, 3), null);
  assert.ok(!subtitlesShown({ ...m, subtitles: { ...m.subtitles, on: false } }, 12));
  assert.ok(!subtitlesShown(clip([]), 12));
});

test('edited words keep their timing, or share the time they were said in', () => {
  const words = said('who is a good boy');
  assert.deepEqual(retimeWords(words, 'Who is a GOOD boy').map((x) => [x.w, x.s]), words.map((x, k) => [['Who', 'is', 'a', 'GOOD', 'boy'][k], x.s]));
  const fewer = retimeWords(words, 'good boy');
  assert.equal(fewer.length, 2);
  assert.equal(fewer[0].s, words[0].s);
  assert.equal(fewer[1].e, words[4].e);
  assert.deepEqual(retimeWords(words, '  '), []);
});

test('words come up a few at a time, broken at pauses and full stops, with no gaps', () => {
  const words = [...said('Who is a good boy? You are'), { w: 'treats', s: 4, e: 4.3 }];
  const groups = subtitleGroups(words);
  assert.deepEqual(groups.map((g) => g.map((x) => x.w).join(' ')), ['Who is a good', 'boy?', 'You are', 'treats']);
  const { segments } = subtitleTimeline(words, 4.5);
  assert.equal(segments[0].from, 0);
  assert.equal(segments[segments.length - 1].to, 4.5);
  for (let k = 1; k < segments.length; k++) assert.equal(segments[k].from, segments[k - 1].to);
  assert.ok(segments.some((x) => x.group === null && x.from > 2.5));
  assert.deepEqual(subtitleTimeline([], 3).segments, [{ from: 0, to: 3, group: null, word: null }]);
});

test('subtitles change the Reel key and make the clip text layer a timed one', () => {
  const post = { cover_index: 0, cover_headline: 'Hi', reel_music: 'none', reel_lines: [], media: [clip(said('Good boy'))] };
  const off = { ...post, media: [{ path: 'v.mp4', kind: 'video' }] };
  assert.equal(reelKey(off), JSON.stringify({ photos: ['v.mp4'], texts: ['Hi'], music: 'none' }));
  assert.notEqual(reelKey(post), reelKey(off));
  const { graph } = reelFilterGraph(['video', 'image'], [10], { music: false, timed: [0] });
  assert.match(graph.split(';').find((p) => p.startsWith('[2:v]')), /fps=24,tpad/);
  assert.match(graph.split(';').find((p) => p.startsWith('[3:v]')), /loop=/);
});
