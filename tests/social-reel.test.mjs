import test from 'node:test';
import assert from 'node:assert/strict';
import { reelItems, reelContents, reelTimeline, reelFilterGraph, reelTexts, reelKey, reelBlocker, cleanReelEdits, REEL_FADE, REEL_END } from '../lib/socialReelPlan.js';
import { approvalBlocker } from '../lib/socialPosts.js';

const photo = (path, extra = {}) => ({ path, kind: 'image', ...extra });
const base = {
  cover_index: 2,
  cover_headline: 'Four minutes of cake',
  caption_instagram: 'A caption',
  media: [photo('a'), { path: 'v', kind: 'video' }, photo('c'), photo('d', { excluded: true }), photo('e')],
  reel_lines: [null, null, null, 'Left out anyway', 'Make a wish'],
  reel_music: 'sunny',
  post_as: 'reel',
};

test('the Reel uses the photos and clips, cover first, nothing left out', () => {
  assert.deepEqual(reelItems(base), [2, 0, 1, 4]);
  assert.deepEqual(reelTexts(base), ['Four minutes of cake', '', '', 'Make a wish']);
  assert.equal(reelContents(base), '3 photos + 1 video');
});

test('the Reel stays short whatever goes in, and adds up', () => {
  for (let n = 1; n <= 6; n++) {
    const { durations, offsets, total } = reelTimeline(Array(n).fill('image'));
    assert.equal(durations.length, n);
    assert.ok(total >= 6 && total <= 13.5, `${n} photos: ${total}s`);
    const sum = durations.reduce((a, b) => a + b, 0);
    assert.equal(total, Number((sum + REEL_END - REEL_FADE * n).toFixed(3)));
    assert.ok(offsets.every((o, k) => k === 0 || o > offsets[k - 1]));
  }
  assert.equal(reelTimeline(Array(9).fill('image')).durations.length, 6);
});

test('the filter graph chains one crossfade per photo and maps video and music', () => {
  const { graph, total } = reelFilterGraph(['image', 'image', 'image'], [], { music: true });
  assert.equal((graph.match(/xfade=/g) || []).length, 3);
  assert.equal((graph.match(/zoompan=/g) || []).length, 3);
  assert.match(graph, /\[x2\]\[end\]xfade=.*\[v\]/);
  assert.match(graph, /\[7:a\]atrim=0:/);
  assert.ok(total > 0);
  // The first photo's text is there from the first frame (the thumbnail).
  assert.doesNotMatch(graph.split(';').find((p) => p.startsWith('[3:v]')), /fade=t=in/);
  assert.match(graph.split(';').find((p) => p.startsWith('[4:v]')), /fade=t=in/);
  assert.doesNotMatch(reelFilterGraph(['image'], [], { music: false }).graph, /:a\]/);
});

test('a made Reel goes out of date when its text, photos or music change', () => {
  const made = { ...base, reel: { path: 'social/x/reel.mp4', key: reelKey(base) } };
  assert.equal(reelBlocker(made), null);
  assert.match(reelBlocker({ ...made, reel_music: 'gentle' }), /changed/);
  assert.match(reelBlocker({ ...made, cover_headline: 'Cake' }), /changed/);
  assert.match(reelBlocker({ ...made, cover_index: 0 }), /changed/);
  assert.match(reelBlocker({ ...base, reel: null }), /Make the Reel first/);
  assert.equal(reelBlocker({ ...base, post_as: 'photos' }), null);
  assert.match(approvalBlocker({ ...base, reel: null }), /Make the Reel first/);
});

test('Reel edits from the page are cleaned to one line per file', () => {
  const edits = cleanReelEdits({ reel_lines: ['Hi 🎂', 5, 'Ok'], reel_music: 'disco', post_as: 'reel', cover_headline: '  Cake  ' }, base.media);
  assert.deepEqual(edits.reel_lines, ['Hi 🎂', null, 'Ok', null, null]);
  assert.equal(edits.reel_music, undefined);
  assert.equal(edits.post_as, 'reel');
  assert.equal(edits.cover_headline, 'Cake');
  assert.deepEqual(cleanReelEdits({}, base.media), {});
});

test('clips play a few seconds from just after the start, and a long Reel is cut down', () => {
  const t = reelTimeline(['image', 'video', 'video'], [undefined, 12, 1.5]);
  assert.equal(t.starts[1], 0.3);
  assert.equal(t.durations[1], 4.5);
  assert.equal(t.starts[2], 0);
  assert.equal(t.durations[2], 1.5);
  const long = reelTimeline(Array(6).fill('video'), Array(6).fill(30));
  assert.ok(long.total <= 15.001, `total ${long.total}`);
  assert.ok(long.durations.every((d) => d >= 2));
  const { graph } = reelFilterGraph(['video', 'image'], [10], { music: true });
  assert.match(graph.split(';')[0], /^\[0:v\]fps=24,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920/);
  assert.doesNotMatch(graph.split(';')[0], /zoompan/);
});

test('a Story uses the photos and clips as frames, cover first, up to ten', async () => {
  const { storyItems, storyFrameKey } = await import('../lib/socialReelPlan.js');
  assert.deepEqual(storyItems(base), [2, 0, 1, 4]);
  const many = { cover_index: 0, media: Array.from({ length: 14 }, (_, i) => photo(`p${i}`)) };
  assert.equal(storyItems(many).length, 10);
  assert.notEqual(storyFrameKey(photo('a'), 'Hi'), storyFrameKey(photo('a'), 'Hello'));
  assert.equal(cleanReelEdits({ post_as: 'story' }, base.media).post_as, 'story');
});
