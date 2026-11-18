// The pet profile photo is cropped to a centred square before it's shrunk
// (lib/profilePhoto.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareCrop, PROFILE_PHOTO_SIDE } from '../lib/profilePhoto.js';

test('a landscape or portrait phone photo is cropped to its centre square', () => {
  assert.deepEqual(squareCrop(4000, 3000), { sx: 500, sy: 0, size: 3000 });
  assert.deepEqual(squareCrop(3000, 4000), { sx: 0, sy: 500, size: 3000 });
  assert.deepEqual(squareCrop(640, 640), { sx: 0, sy: 0, size: 640 });
  assert.equal(PROFILE_PHOTO_SIDE, 640);
});
