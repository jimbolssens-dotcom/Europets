// lib/socialLayout.js
// Server-side: a Social post's layout picture (lib/socialLayoutPlan.js,
// migration 211): a Before / After or a Collage, each photo with its
// touch-ups (lib/socialTouchUp.js) cut to its cell, on the app's near-black,
// then the cover text and the logo (lib/socialCover.js). Used for the
// preview on the draft (app/api/social-posts/[id]/layout) and for what's
// posted (lib/metaSocial.js), so they match.

import sharp from 'sharp';
import { HEXFIELD, monoLabel, renderCover } from '@/lib/socialCover';
import { preparePhoto } from '@/lib/socialTouchUp';
import { LAYOUT_W, LAYOUT_H, layoutCells } from '@/lib/socialLayoutPlan';

const { VOID, MAGENTA, CHALK } = HEXFIELD;

// A "BEFORE" / "AFTER" pill centred on cx, its middle at cy, as SVG.
function pill(text, cx, cy, W, fill) {
  const size = Math.round(W * 0.03);
  const label = monoLabel(text, cx, cy + size * 0.36, size, 0.22);
  const padX = Math.round(size * 0.9);
  const h = Math.round(size * 2.1);
  const w = Math.round(label.width + padX * 2);
  return `<rect x="${Math.round(cx - w / 2)}" y="${Math.round(cy - h / 2)}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" fill-opacity="0.88"/>
  <path d="${label.d}" fill="${CHALK}"/>`;
}

// kind: 'before_after' | 'collage'; photos: [{ image, item }] in order
// (image: the photo as uploaded, item: its media item). Returns a JPEG.
export async function renderLayout(kind, photos, headline, { width = LAYOUT_W, quality = 90 } = {}) {
  const W = Math.round(width);
  const H = Math.round((width * LAYOUT_H) / LAYOUT_W);
  const cells = layoutCells(kind, photos.length, W, H, Math.max(3, Math.round((W * 8) / LAYOUT_W)));
  const tiles = await Promise.all(
    cells.map(async (c, k) => ({
      input: await preparePhoto(photos[k].image, photos[k].item, { frame: 'fill', W: c.width, H: c.height, quality: 95 }),
      left: c.left,
      top: c.top,
    }))
  );
  if (kind === 'before_after') {
    // Level with the logo, which sits in the middle on the seam.
    const cy = Math.round(W * 0.045 + W * 0.075);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${pill('Before', cells[0].left + cells[0].width / 2 - W * 0.04, cy, W, VOID)}
  ${pill('After', cells[1].left + cells[1].width / 2 + W * 0.04, cy, W, MAGENTA)}
</svg>`;
    tiles.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }
  const picture = await sharp({ create: { width: W, height: H, channels: 3, background: VOID } }).composite(tiles).jpeg({ quality: 95 }).toBuffer();
  return renderCover(picture, headline || '', { maxWidth: W, quality, logo: kind === 'before_after' ? 'center' : 'left' });
}
