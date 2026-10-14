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
  // Start from a sensible width for the target instead of the camera's full
  // resolution: a 12-megapixel phone photo can't reach ~300 KB at full size
  // anyway, and re-encoding it there five times first made the background
  // sweep crawl. ~1800px stays sharp on screen and in PDFs; x-rays (a 2 MB
  // target) start near full resolution and at higher quality.
  const large = targetBytes >= 1024 * 1024;
  const startWidth = targetBytes <= 400 * 1024 ? 1800 : large ? 4000 : 2800;
  const qualitySteps = large ? [90, ...QUALITY_STEPS] : QUALITY_STEPS;
  let width = meta.width ? Math.min(meta.width, startWidth) : startWidth;
  let smallest = null;

  while (true) {
    for (const quality of qualitySteps) {
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
