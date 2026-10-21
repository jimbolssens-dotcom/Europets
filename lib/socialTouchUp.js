// lib/socialTouchUp.js
// Server-side: a Social post's photo with its touch-ups from the draft
// (lib/socialTouchUpPlan.js): the look, the crop around the spot staff
// picked, the pet's speech bubble and the sticker, in the client app's
// Hexfield colours (lib/socialCover.js). The same drawing for the feed photo
// (lib/metaSocial.js), its preview (app/api/social-posts/[id]/cover), the
// Reel (lib/socialReel.js) and the Story (lib/socialStory.js), so what staff
// see is what goes out.

import sharp from 'sharp';
import { HEXFIELD, headlineFont, monoLabel, hexPoints, coverHeadlineText } from '@/lib/socialCover';
import { fitHeadline } from '@/lib/socialCoverLayout';
import { STICKERS, cleanTouchUp, cropFocus, feedCrop, fillCrop, pointInCrop, bubbleLayout } from '@/lib/socialTouchUpPlan';

const { VOID, MAGENTA, HOT, DEEP, CHALK } = HEXFIELD;

// The looks, as sharp steps. Gentle on purpose: a clinic photo should still
// look like the clinic.
function withLook(img, look) {
  const flat = img.flatten({ background: '#ffffff' });
  switch (look) {
    case 'auto':
      return flat.normalise({ lower: 1, upper: 99 }).modulate({ saturation: 1.08 });
    case 'warm':
      return flat.modulate({ brightness: 1.03, saturation: 1.12 }).linear([1.05, 1.0, 0.9], [6, 2, -4]);
    case 'bright':
      return flat.modulate({ brightness: 1.12, saturation: 1.06 }).linear(1.1, -12);
    case 'soft':
      return flat.modulate({ brightness: 1.05, saturation: 0.8 }).linear(0.88, 22);
    case 'bw':
      return flat.grayscale().normalise({ lower: 1, upper: 99 }).linear(1.08, -8).toColourspace('srgb');
    default:
      return flat;
  }
}

// The pet's speech bubble in a W x H frame pointing at (px, py), as SVG
// elements: white, rounded, a soft shadow, the words in the app's font.
function bubbleSvg(W, H, text, px, py, top) {
  const line = coverHeadlineText(text);
  if (!line) return '';
  const f = headlineFont();
  const { size, lines } = fitHeadline(line, (s) => (str) => f.getAdvanceWidth(str, s), W * 0.5, {
    maxSize: Math.round(W * 0.052),
    minSize: Math.round(W * 0.036),
    maxLines: 3,
  });
  const padX = Math.round(size * 0.8);
  const padY = Math.round(size * 0.55);
  const lineHeight = Math.round(size * 1.15);
  const widths = lines.map((l) => f.getAdvanceWidth(l, size));
  const boxW = Math.round(Math.max(...widths) + padX * 2);
  const boxH = Math.round(padY * 2 + size * 1.1 + (lines.length - 1) * lineHeight);
  const { x, y, above, tip } = bubbleLayout(W, H, px, py, boxW, boxH, { top });
  const r = Math.min(Math.round(boxH / 2), Math.round(size * 0.9));
  const baseW = Math.round(size * 0.95);
  const baseX = Math.min(x + boxW - r - baseW / 2, Math.max(x + r + baseW / 2, tip.x));
  const edge = above ? y + boxH - 1 : y + 1;
  const tail = `${baseX - baseW / 2},${edge} ${baseX + baseW / 2},${edge} ${tip.x},${tip.y}`;
  const paths = lines
    .map((l, n) => f.getPath(l, Math.round(x + (boxW - widths[n]) / 2), Math.round(y + padY + size * 0.85 + n * lineHeight), size).toPathData(1))
    .join(' ');
  const sh = Math.max(2, Math.round(W * 0.006));
  return `<g fill="#000" fill-opacity="0.28" transform="translate(${sh * 0.5} ${sh})">
    <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="${r}"/><polygon points="${tail}"/>
  </g>
  <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="${r}" fill="#fff"/>
  <polygon points="${tail}" fill="#fff"/>
  <path d="${paths}" fill="${VOID}"/>`;
}

// One paw print around (0, 0), p across.
function paw(p) {
  const e = (cx, cy, rx, ry) => `<ellipse cx="${(cx * p).toFixed(1)}" cy="${(cy * p).toFixed(1)}" rx="${(rx * p).toFixed(1)}" ry="${(ry * p).toFixed(1)}"/>`;
  return [e(0, 0.14, 0.3, 0.25), e(-0.34, -0.17, 0.11, 0.14), e(-0.13, -0.36, 0.115, 0.15), e(0.13, -0.36, 0.115, 0.15), e(0.34, -0.17, 0.11, 0.14)].join('');
}

const HEART = 'M0 0.36 C-0.58 0.02 -0.5 -0.46 0 -0.2 C0.5 -0.46 0.58 0.02 0 0.36 Z';

// The sticker, s px, its top right corner at (right, top), as SVG elements.
function stickerSvg(key, s, right, top) {
  const sticker = STICKERS.find((k) => k.key === key);
  if (!sticker) return '';
  const cx = right - s / 2;
  const cy = top + s / 2;
  const stroke = Math.max(2, Math.round(s * 0.025));
  if (key === 'paws' || key === 'hearts') {
    // Three of them in a little trail, biggest nearest the corner.
    const spots = [
      [0.2, -0.16, 0.7, 20, HOT],
      [-0.3, 0.12, 0.52, -14, MAGENTA],
      [0.14, 0.48, 0.42, 10, HOT],
    ];
    return spots
      .map(([dx, dy, k, rot, fill]) => {
        const p = s * k;
        const shape = key === 'paws' ? paw(p) : `<path d="${HEART}" transform="scale(${(p * 1.1).toFixed(1)})" stroke-width="${(stroke / (p * 1.1)).toFixed(3)}"/>`;
        return `<g transform="translate(${(cx + dx * s).toFixed(1)} ${(cy + dy * s).toFixed(1)}) rotate(${rot})" fill="${fill}" stroke="#fff" stroke-width="${stroke}">${shape}</g>`;
      })
      .join('');
  }
  return hexBadgeSvg(sticker.lines, s, cx, cy, stroke);
}

// A tilted hexagon badge, s px across, centred on (cx, cy), with a few
// short lines in the app's mono font (the text stickers, and Patient of the
// week's badge, lib/socialLayout.js), as SVG elements.
export function hexBadgeSvg(lines, s, cx, cy, stroke = Math.max(2, Math.round(s * 0.025))) {
  const r = s / 2;
  const target = r * 1.732 * 0.74;
  const size = Math.min(s * (lines.length > 2 ? 0.13 : 0.15), ...lines.map((l) => (target / Math.max(1, monoLabel(l, 0, 0, 100).width)) * 100));
  const step = size * 1.3;
  const top = cy - (step * (lines.length - 1)) / 2 + size * 0.4;
  const labels = lines.map((l, n) => monoLabel(l, cx, top + n * step, size).d).join(' ');
  return `<defs><linearGradient id="badge" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="${HOT}"/><stop offset="0.6" stop-color="${MAGENTA}"/><stop offset="1" stop-color="${DEEP}"/>
  </linearGradient></defs>
  <g transform="rotate(-8 ${cx} ${cy})">
    <polygon points="${hexPoints(cx + stroke * 0.6, cy + stroke, r)}" fill="#000" fill-opacity="0.28"/>
    <polygon points="${hexPoints(cx, cy, r)}" fill="#fff"/>
    <polygon points="${hexPoints(cx, cy, r - stroke * 2.2)}" fill="url(#badge)"/>
    <path d="${labels}" fill="${CHALK}"/>
  </g>`;
}

// The photo as a JPEG with its touch-ups. frame 'feed': inside Instagram's
// ratios, at most maxWidth wide (the feed photo and the cover). frame
// 'fill': exactly W x H (a Reel or Story frame); `top` keeps the bubble and
// sticker clear of the logo and Instagram's bar.
export async function preparePhoto(original, item, { frame = 'feed', W, H, maxWidth = 1440, top = 0, quality = 90 } = {}) {
  const t = cleanTouchUp(item);
  const upright = await sharp(original).rotate().toBuffer();
  const { width, height } = await sharp(upright).metadata();
  const focus = cropFocus(item);
  let img;
  let box;
  if (frame === 'fill') {
    box = fillCrop(width, height, W, H, focus);
    img = box
      ? sharp(upright).extract(box).resize(W, H)
      : sharp(upright).resize(W, H, { fit: 'cover', position: sharp.strategy.attention });
  } else {
    box = feedCrop(width, height, focus);
    img = sharp(upright).extract(box).resize({ width: Math.min(maxWidth, box.width), withoutEnlargement: true });
  }
  const base = await withLook(img, t.look).toBuffer();
  const out = sharp(base);
  if (!t.bubble && !t.sticker) return out.jpeg({ quality }).toBuffer();

  const { width: OW, height: OH } = await sharp(base).metadata();
  const parts = [];
  if (t.sticker) {
    const margin = Math.round(OW * 0.045);
    parts.push(stickerSvg(t.sticker, Math.round(OW * 0.22), OW - margin, Math.max(margin, top)));
  }
  if (t.bubble && box) {
    const p = pointInCrop(t.bubble, box, width, height);
    parts.push(bubbleSvg(OW, OH, t.bubble.text, p.x * OW, p.y * OH, top));
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}">${parts.join('')}</svg>`;
  return out.composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality }).toBuffer();
}
