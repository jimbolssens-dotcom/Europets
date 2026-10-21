// lib/socialLayout.js
// Server-side: a Social post's layout picture (lib/socialLayoutPlan.js,
// migration 211): a Before / After, a Collage or Patient of the week, each
// photo with its touch-ups (lib/socialTouchUp.js) cut to its cell, on the
// app's near-black, then the cover text and the logo (lib/socialCover.js);
// or a Tip card, drawn from its words alone. Used for the
// preview on the draft (app/api/social-posts/[id]/layout) and for what's
// posted (lib/metaSocial.js), so they match.

import sharp from 'sharp';
import { HEXFIELD, monoLabel, renderCover, headlineFont, coverHeadlineText, hexPoints, logoBadge } from '@/lib/socialCover';
import { fitHeadline, wrapHeadline } from '@/lib/socialCoverLayout';
import { preparePhoto, hexBadgeSvg } from '@/lib/socialTouchUp';
import { LAYOUT_W, LAYOUT_H, layoutCells, tipPoints } from '@/lib/socialLayoutPlan';
import { INSTAGRAM_HANDLE } from '@/lib/clinicSocial';

const { VOID, MAGENTA, HOT, DEEP, BLUSH, CHALK } = HEXFIELD;

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

// A Tip card: the app's near-black with the honeycomb and a magenta glow,
// the logo, a "PET TIP" label, the title big, then each point beside a
// numbered magenta hexagon, and the clinic's @ at the bottom. A JPEG.
export async function renderTipCard(layout, { width = LAYOUT_W, quality = 90 } = {}) {
  const W = Math.round(width);
  const H = Math.round((width * LAYOUT_H) / LAYOUT_W);
  const f = headlineFont();
  const k = W / LAYOUT_W;
  const pad = Math.round(72 * k);
  const badgeH = Math.round(W * 0.13);
  const parts = [];

  const label = monoLabel('Pet tip', 0, 0, Math.round(30 * k), 0.22);
  const labelH = Math.round(30 * k * 2);
  const labelW = Math.round(label.width + 40 * k);
  const labelY = pad + Math.round((badgeH - labelH) / 2);
  const labelX = W - pad - labelW;
  parts.push(`<rect x="${labelX}" y="${labelY}" width="${labelW}" height="${labelH}" rx="${labelH / 2}" fill="${MAGENTA}"/>`);
  parts.push(`<path d="${monoLabel('Pet tip', labelX + labelW / 2, labelY + labelH / 2 + 30 * k * 0.36, Math.round(30 * k), 0.22).d}" fill="${CHALK}"/>`);

  const title = coverHeadlineText(layout.title);
  const { size, lines } = fitHeadline(title, (sz) => (str) => f.getAdvanceWidth(str, sz), W - pad * 2, { maxSize: Math.round(92 * k), minSize: Math.round(58 * k) });
  let y = pad + badgeH + Math.round(110 * k);
  const titleLh = Math.round(size * 1.08);
  parts.push(`<path d="${lines.map((l, n) => f.getPath(l, pad, y + n * titleLh, size).toPathData(1)).join(' ')}" fill="${CHALK}"/>`);
  y += titleLh * (lines.length - 1) + Math.round(46 * k);
  parts.push(`<rect x="${pad}" y="${y}" width="${Math.round(180 * k)}" height="${Math.max(2, Math.round(5 * k))}" fill="url(#line)"/>`);
  y += Math.round(86 * k);

  // The points share what's left, smaller when there are more of them.
  const points = tipPoints(layout).map((p) => coverHeadlineText(p)).filter(Boolean);
  const room = H - y - Math.round(150 * k);
  const hexR = Math.round(30 * k);
  const textX = pad + hexR * 2 + Math.round(28 * k);
  const textW = W - textX - pad;
  let pointSize = Math.round(46 * k);
  let laid;
  for (; pointSize >= Math.round(32 * k); pointSize -= 2) {
    const measure = (str) => f.getAdvanceWidth(str, pointSize);
    laid = points.map((p) => wrapHeadline(p, measure, textW, 3) || wrapHeadline(p, measure, textW, Infinity).slice(0, 3));
    const height = laid.reduce((a, ls) => a + ls.length * pointSize * 1.22, 0) + (points.length - 1) * pointSize * 0.9;
    if (height <= room) break;
  }
  const lh = Math.round(pointSize * 1.22);
  laid.forEach((ls, n) => {
    const cy = y - Math.round(pointSize * 0.34);
    parts.push(`<polygon points="${hexPoints(pad + hexR, cy, hexR)}" fill="${MAGENTA}"/>`);
    parts.push(`<path d="${monoLabel(String(n + 1), pad + hexR, cy + Math.round(26 * k * 0.36), Math.round(26 * k), 0).d}" fill="${CHALK}"/>`);
    parts.push(`<path d="${ls.map((l, j) => f.getPath(l, textX, y + j * lh, pointSize).toPathData(1)).join(' ')}" fill="${n % 2 ? BLUSH : CHALK}"/>`);
    y += lh * ls.length + Math.round(pointSize * 0.9);
  });

  const handle = monoLabel(`@${INSTAGRAM_HANDLE}`, W / 2, H - Math.round(70 * k), Math.round(28 * k), 0.18);
  parts.push(`<path d="${handle.d}" fill="${BLUSH}"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <pattern id="comb" width="${42 * k * 2}" height="${72 * k * 2}" patternUnits="userSpaceOnUse">
      <g fill="none" stroke="rgb(255,120,178)" stroke-opacity="0.14" stroke-width="${Math.max(1, 2.2 * k).toFixed(1)}" transform="scale(${2 * k})">
        <path d="M21 0 L42 12 L42 36 L21 48 L0 36 L0 12 Z"/><path d="M0 36 L21 48 L21 72"/><path d="M42 36 L42 60"/>
      </g>
    </pattern>
    <radialGradient id="glow" cx="0.85" cy="0.05" r="0.8">
      <stop offset="0" stop-color="${MAGENTA}" stop-opacity="0.38"/>
      <stop offset="0.55" stop-color="${DEEP}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${HOT}"/><stop offset="1" stop-color="${MAGENTA}" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${VOID}"/>
  <rect width="${W}" height="${H}" fill="url(#comb)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${parts.join('\n  ')}
</svg>`;
  return sharp(Buffer.from(svg))
    .composite([{ input: await logoBadge(badgeH), left: pad, top: pad }])
    .jpeg({ quality })
    .toBuffer();
}

// layout: the post's layout ({ kind, items, name... }); photos: [{ image,
// item }] in order (image: the photo as uploaded, item: its media item).
// Returns a JPEG.
export async function renderLayout(layout, photos, headline, { width = LAYOUT_W, quality = 90 } = {}) {
  const kind = layout.kind;
  if (kind === 'tip') return renderTipCard(layout, { width, quality });
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
  if (kind === 'potw') {
    // The badge in the top corner, the pet's name as the headline and the
    // cover text under it.
    const s = Math.round(W * 0.27);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${hexBadgeSvg(['Patient', 'of the', 'week'], s, W - Math.round(W * 0.05) - s / 2, Math.round(W * 0.05) + s / 2)}</svg>`;
    tiles.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }
  const picture = await sharp({ create: { width: W, height: H, channels: 3, background: VOID } }).composite(tiles).jpeg({ quality: 95 }).toBuffer();
  if (kind === 'potw') return renderCover(picture, layout.name || headline || '', { maxWidth: W, quality, subline: layout.name ? headline : '' });
  return renderCover(picture, headline || '', { maxWidth: W, quality, logo: kind === 'before_after' ? 'center' : 'left' });
}
