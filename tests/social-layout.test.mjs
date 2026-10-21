import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLayout, layoutItems, layoutBlocker, layoutCells, layoutKey, afterLayout, defaultLayoutItems, LAYOUT_W, LAYOUT_H, LAYOUT_GAP } from '../lib/socialLayoutPlan.js';
import { approvalBlocker } from '../lib/socialPosts.js';

const photo = (path, extra = {}) => ({ path, kind: 'image', ...extra });
const media = [photo('a'), { path: 'v', kind: 'video' }, photo('c'), photo('d', { excluded: true }), photo('e'), photo('f')];
const base = { cover_index: 2, media, post_as: 'photos', caption_instagram: 'Hi', consent: 'yes', patient_id: null };

test('a layout keeps only photos, each once, up to what it takes', () => {
  assert.deepEqual(cleanLayout({ kind: 'before_after', items: [2, 2, 1, 0, 4] }, media), { kind: 'before_after', items: [2, 0] });
  assert.deepEqual(cleanLayout({ kind: 'collage', items: [0, 2, 4, 5, 99] }, media), { kind: 'collage', items: [0, 2, 4, 5] });
  assert.equal(cleanLayout({ kind: 'mosaic', items: [0, 2] }, media), null);
  assert.equal(cleanLayout(null, media), null);
});

test('a layout only counts on a photos post with enough photos not left out', () => {
  const post = { ...base, layout: { kind: 'before_after', items: [0, 3] } };
  assert.equal(layoutItems(post), null);
  assert.match(layoutBlocker(post), /before and the after/);
  assert.match(approvalBlocker(post), /before and the after/);
  const ok = { ...base, layout: { kind: 'before_after', items: [0, 2] } };
  assert.deepEqual(layoutItems(ok), [0, 2]);
  assert.equal(layoutBlocker(ok), null);
  assert.equal(layoutItems({ ...ok, post_as: 'reel' }), null);
  assert.equal(layoutBlocker({ ...post, post_as: 'reel' }), null);
  assert.equal(layoutBlocker({ ...base, layout: null }), null);
});

test('the cells fill the picture without overlapping', () => {
  for (const [kind, n] of [['before_after', 2], ['collage', 2], ['collage', 3], ['collage', 4]]) {
    const cells = layoutCells(kind, n);
    assert.equal(cells.length, n);
    const area = cells.reduce((a, c) => a + c.width * c.height, 0);
    assert.ok(area < LAYOUT_W * LAYOUT_H && area > LAYOUT_W * LAYOUT_H * 0.97, `${kind} ${n}`);
    for (const c of cells) assert.ok(c.left >= 0 && c.top >= 0 && c.left + c.width <= LAYOUT_W && c.top + c.height <= LAYOUT_H);
  }
  const [b, a] = layoutCells('before_after', 2);
  assert.equal(a.left - (b.left + b.width), LAYOUT_GAP);
  assert.equal(b.height, LAYOUT_H);
});

test('the layout goes first, then the photos not in it; its key follows what it is drawn from', () => {
  const post = { ...base, layout: { kind: 'collage', items: [0, 4] }, cover_headline: 'Hi' };
  assert.deepEqual(afterLayout(post), [2, 1, 5]);
  assert.notEqual(layoutKey(post), layoutKey({ ...post, cover_headline: 'Hello' }));
  assert.notEqual(layoutKey(post), layoutKey({ ...post, media: media.map((m, i) => (i === 0 ? { ...m, look: 'warm' } : m)) }));
  assert.equal(layoutKey({ ...post, layout: null }), '');
  assert.deepEqual(defaultLayoutItems(base, 'before_after'), [2, 0]);
  assert.deepEqual(defaultLayoutItems(base, 'collage'), [2, 0, 4, 5]);
});
