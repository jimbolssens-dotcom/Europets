// lib/imageCompression.js
// Squeeze a photo down toward a target file size. There's no direct "make
// it exactly N bytes" knob in any image library — quality and dimensions
// both affect the output size, and how much depends on the image content —
// so this steps quality down first, then dimensions, re-encoding at each
// step until the result fits.

import sharp from 'sharp';

const QUALITY_STEPS = [80, 65, 50, 40, 30];
const MIN_WIDTH = 200;

export async function compressImageToTarget(buffer, targetBytes) {
  const image = sharp(buffer).rotate(); // rotate() bakes in EXIF orientation before we strip metadata
  const meta = await image.metadata();
  let width = meta.width;
  let smallest = null;

  while (true) {
    for (const quality of QUALITY_STEPS) {
      const out = await sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
      if (!smallest || out.length < smallest.length) smallest = out;
      if (out.length <= targetBytes) return out;
    }
    if (!width || width <= MIN_WIDTH) break;
    width = Math.round(width * 0.75);
  }

  // Never got under target (an unusually busy/noisy image) — return the
  // smallest attempt we found rather than leaving the original untouched.
  return smallest;
}
