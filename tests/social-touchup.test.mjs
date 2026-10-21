import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTouchUp, touchUpKey, touchUpFromQuery, cropFocus, feedCrop, fillCrop, pointInCrop, bubbleLayout } from '../lib/socialTouchUpPlan.js';
import { reelKey, storyFrameKey } from '../lib/socialReelPlan.js';
import { buildRemixText } from '../lib/socialDraftPrompt.js';

const photo = (extra = {}) => ({ path: 'social/p/a.jpg', kind: 'image', ...extra });

test('only valid touch-ups are kept, points inside the photo', () => {
  assert.deepEqual(cleanTouchUp({ look: 'neon', sticker: 'skull', focus: { x: 2, y: -1 }, bubble: { text: '  Hi — there  ', x: 0.3, y: 'a' } }), {
    look: null,
    sticker: null,
    focus: { x: 1, y: 0 },
    bubble: { text: 'Hi, there', x: 0.5, y: 0.5 },
  });
  assert.equal(cleanTouchUp({ bubble: { text: '   ' } }).bubble, null);
  assert.equal(cleanTouchUp({ look: 'warm', sticker: 'paws' }).look, 'warm');
});

test('an untouched photo keys as before, so made Reels and Stories stay current', () => {
  assert.equal(touchUpKey(photo()), '');
  assert.notEqual(touchUpKey(photo({ look: 'bw' })), '');
  const post = { cover_index: 0, cover_headline: 'Hi', media: [photo()], reel_lines: [], reel_music: 'sunny' };
  assert.equal(reelKey(post), JSON.stringify({ photos: ['social/p/a.jpg'], texts: ['Hi'], music: 'sunny' }));
  assert.notEqual(reelKey({ ...post, media: [photo({ sticker: 'hearts' })] }), reelKey(post));
  assert.equal(storyFrameKey(photo(), 'Hi'), 'social/p/a.jpg|Hi');
  assert.notEqual(storyFrameKey(photo({ look: 'warm' }), 'Hi'), 'social/p/a.jpg|Hi');
});

test('the preview reads unsaved touch-ups from its query', () => {
  const q = new URLSearchParams('look=soft&fx=0.2&fy=0.7&bt=Treats%3F&bx=0.4&by=0.3&st=brave');
  assert.deepEqual(touchUpFromQuery(q), { look: 'soft', focus: { x: 0.2, y: 0.7 }, bubble: { text: 'Treats?', x: 0.4, y: 0.3 }, sticker: 'brave' });
  assert.deepEqual(touchUpFromQuery(new URLSearchParams('')), { look: null, focus: null, bubble: null, sticker: null });
});

test('the crop follows the spot staff picked, else where the bubble points', () => {
  // A 3:4 phone photo goes to 4:5: without a focus, centred as before.
  assert.deepEqual(feedCrop(3000, 4000, null), { left: 0, top: 125, width: 3000, height: 3750 });
  assert.deepEqual(feedCrop(3000, 4000, { x: 0.5, y: 0 }), { left: 0, top: 0, width: 3000, height: 3750 });
  assert.deepEqual(feedCrop(3000, 4000, { x: 0.5, y: 1 }), { left: 0, top: 250, width: 3000, height: 3750 });
  assert.equal(fillCrop(3000, 4000, 1080, 1920, null), null);
  const box = fillCrop(4000, 3000, 1080, 1920, { x: 0.1, y: 0.5 });
  assert.deepEqual(box, { left: 0, top: 0, width: 1688, height: 3000 });
  assert.deepEqual(cropFocus(photo({ bubble: { text: 'Hi', x: 0.2, y: 0.3 } })), { x: 0.2, y: 0.3 });
  assert.deepEqual(cropFocus(photo({ focus: { x: 0.6, y: 0.6 }, bubble: { text: 'Hi', x: 0.2, y: 0.3 } })), { x: 0.6, y: 0.6 });
  const p = pointInCrop({ x: 0.1, y: 0.5 }, box, 4000, 3000);
  assert.ok(Math.abs(p.x - 400 / 1688) < 1e-9 && p.y === 0.5);
  assert.equal(pointInCrop({ x: 0.99, y: 0.5 }, box, 4000, 3000).x, 0.95);
});

test('the bubble sits above the pet when there is room, below when not, inside the frame', () => {
  const up = bubbleLayout(1000, 1250, 500, 700, 400, 120);
  assert.equal(up.above, true);
  assert.ok(up.y + 120 < 700 && up.tip.y < 700);
  const down = bubbleLayout(1000, 1250, 900, 80, 400, 120, { top: 60 });
  assert.equal(down.above, false);
  assert.ok(down.y > 80 && down.tip.y > 80);
  assert.ok(down.x >= 40 && down.x + 400 <= 960);
});

test('a remix asks for three versions in the chosen direction, keeping the voice rules', () => {
  const text = buildRemixText({ field: 'caption_instagram', tone: 'funny', text: 'Poes had lunch.\n#EuropetsClinic', story: 'Poes ate', petName: 'Poes' });
  assert.match(text, /Instagram caption/);
  assert.match(text, /funnier/i);
  assert.match(text, /Poes had lunch/);
  assert.match(text, /three versions/);
  assert.match(buildRemixText({ field: 'bubble', text: '' }), /what the pet in the photo would say[\s\S]*fresh from the photo[\s\S]*three different fresh ideas/);
});
