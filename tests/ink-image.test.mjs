// Signature/stamp images for prescriptions (migration 251).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inkify } from '../lib/inkImage.js';
import { signatureKey, parsePngDataUrl, fitInBox } from '../lib/signatureImages.js';

function sheet(w, h, ink = []) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data.set([238, 238, 240, 255], i * 4); // greyish photographed paper
  }
  for (const [x, y, rgb] of ink) data.set([...rgb, 255], (y * w + x) * 4);
  return data;
}

test('paper becomes transparent and the ink keeps its colour', () => {
  const blue = [30, 30, 140];
  const data = sheet(20, 10, [[5, 3, blue], [12, 6, blue]]);
  const { box } = inkify(data, 20, 10);
  assert.deepEqual(box, { x: 5, y: 3, w: 8, h: 4 });
  assert.equal(data[3], 0); // paper
  const o = (3 * 20 + 5) * 4;
  assert.equal(data[o + 3], 255);
  assert.deepEqual([data[o], data[o + 1], data[o + 2]], blue);
});

test('a blank sheet has no ink', () => {
  assert.equal(inkify(sheet(10, 10), 10, 10).box, null);
});

test('keys only for a staff uuid and a known kind', () => {
  const id = '2b8f0c1e-4a7d-4c3e-9f00-1234567890ab';
  assert.equal(signatureKey(id), `staff:${id}`);
  assert.equal(signatureKey(id.toUpperCase(), 'stamp'), `stamp:${id}`);
  assert.equal(signatureKey(id, 'logo'), null);
  assert.equal(signatureKey('stamp'), null);
  assert.equal(signatureKey("x' or 1=1"), null);
});

test('only a real PNG is accepted', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000020000000108060000', 'hex');
  const ok = parsePngDataUrl(`data:image/png;base64,${png.toString('base64')}`);
  assert.ok(ok.bytes);
  assert.ok(parsePngDataUrl(`data:image/png;base64,${Buffer.from('GIF89a....').toString('base64')}`).error);
  assert.ok(parsePngDataUrl('data:image/jpeg;base64,AAAA').error);
});

test('fits inside the box keeping its shape', () => {
  assert.deepEqual(fitInBox(400, 100, 200, 80), { width: 200, height: 50 });
  assert.deepEqual(fitInBox(100, 100, 200, 80), { width: 80, height: 80 });
});
