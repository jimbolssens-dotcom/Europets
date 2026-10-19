import test from 'node:test';
import assert from 'node:assert/strict';
import { fitInstagramRatio, instagramPlan, facebookPlan } from '../lib/socialPublishPlan.js';

test('photos are centre-cropped into Instagram limits, never stretched', () => {
  // A 3:4 phone photo is too tall: cropped to 4:5.
  assert.deepEqual(fitInstagramRatio(3000, 4000), { left: 0, top: 125, width: 3000, height: 3750 });
  // A 4:5 or square photo is left whole.
  assert.deepEqual(fitInstagramRatio(1080, 1350), { left: 0, top: 0, width: 1080, height: 1350 });
  assert.deepEqual(fitInstagramRatio(1000, 1000), { left: 0, top: 0, width: 1000, height: 1000 });
  // A panorama is cropped to 1.91:1.
  const pano = fitInstagramRatio(4000, 1000);
  assert.equal(pano.width, 1910);
  assert.equal(pano.left, 1045);
});

test('what goes out on each network', () => {
  const photo = { kind: 'image' };
  const video = { kind: 'video' };
  assert.equal(instagramPlan([photo]).kind, 'image');
  assert.equal(instagramPlan([video]).kind, 'reel');
  assert.equal(instagramPlan([photo, video, photo]).kind, 'carousel');
  assert.equal(instagramPlan(new Array(12).fill(photo)).items.length, 10);
  assert.deepEqual(facebookPlan([photo, video]), { kind: 'video', items: [video] });
  assert.equal(facebookPlan([photo, photo]).kind, 'photos');
});
