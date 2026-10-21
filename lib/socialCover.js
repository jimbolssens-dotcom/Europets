// lib/socialCover.js
// Server-side: the cover photo of a Social post with its headline laid over
// it (migration 206), in a light touch of the client app's "Hexfield" look
// (globals.css, .client-app): a near-black fade at the bottom with a hint of
// magenta and the honeycomb fading out upwards, a small magenta hexagon and
// line above the headline in Fraunces (the app's display font), and the logo
// on a hex plate in the corner. Text is drawn as shapes from the embedded
// fonts, since Vercel's servers have no fonts for sharp to use.
//
// Used for the live preview on the draft (app/api/social-posts/[id]/cover)
// and for the photo that actually goes out (lib/metaSocial.js), so what
// staff approve is what's posted. Reels made from the photos
// (lib/socialReel.js) use the same headline, logo and font.

import sharp from 'sharp';
import opentype from 'opentype.js';
import { FRAUNCES_800_WOFF_BASE64 } from '@/lib/coverAssets/fraunces800';
import { AZERET_MONO_600_WOFF_BASE64 } from '@/lib/coverAssets/azeretMono600';
import { LOGO_PNG_BASE64 } from '@/lib/coverAssets/logo';
import { cleanHeadline, fitHeadline } from '@/lib/socialCoverLayout';

// The client app's Hexfield tokens (globals.css, .client-app).
const VOID = '#07060a';
const MAGENTA = '#e6186d';
const HOT = '#ff3d8c';
const DEEP = '#78083b';
const BLUSH = '#ffc5dd';
const CHALK = '#f6eef2';
// For the photo touch-ups (lib/socialTouchUp.js), drawn in the same look.
export const HEXFIELD = { VOID, MAGENTA, HOT, DEEP, BLUSH, CHALK };

function parseFont(base64) {
  const buf = Buffer.from(base64, 'base64');
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

let font;
export function headlineFont() {
  if (!font) font = parseFont(FRAUNCES_800_WOFF_BASE64);
  return font;
}

let mono;
function labelFont() {
  if (!mono) mono = parseFont(AZERET_MONO_600_WOFF_BASE64);
  return mono;
}

// A small letter-spaced label in the app's mono font, centred on cx:
// { d, width } for an SVG path.
export function monoLabel(text, cx, y, size, tracking = 0.18) {
  const f = labelFont();
  const chars = [...String(text).toUpperCase()].filter((ch) => ch === ' ' || f.charToGlyphIndex(ch) > 0);
  const gap = size * tracking;
  const widths = chars.map((ch) => f.getAdvanceWidth(ch, size));
  const width = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, chars.length - 1);
  let x = cx - width / 2;
  const d = chars
    .map((ch, i) => {
      const path = f.getPath(ch, x, y, size).toPathData(1);
      x += widths[i] + gap;
      return path;
    })
    .join(' ');
  return { d, width };
}

// A pointy-top regular hexagon (the app's --hex shape) around cx, cy with
// circumradius r, as SVG points.
export function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

// The app's honeycomb background (the same 42 x 72 tile), scaled by k, as
// an SVG <pattern> with the given id.
function honeycombPattern(id, k, opacity) {
  return `<pattern id="${id}" width="${42 * k}" height="${72 * k}" patternUnits="userSpaceOnUse">
    <g fill="none" stroke="rgb(255,120,178)" stroke-opacity="${opacity}" stroke-width="${Math.max(1, k * 1.1).toFixed(1)}" transform="scale(${k})">
      <path d="M21 0 L42 12 L42 36 L21 48 L0 36 L0 12 Z"/><path d="M0 36 L21 48 L21 72"/><path d="M42 36 L42 60"/>
    </g>
  </pattern>`;
}

export function coverHeadlineText(text) {
  const f = headlineFont();
  return cleanHeadline(text, (ch) => f.charToGlyphIndex(ch) > 0);
}

// The headline layer for a W x H frame, as SVG: the dark fade with its
// magenta glow and honeycomb, the hexagon and line, and the text. bottomGap is how far above the bottom edge the last line
// sits (a Reel keeps it clear of Instagram's buttons and caption).
function headlineSvg(W, H, headline, { bottomGap = Math.round(W * 0.085) } = {}) {
  const text = coverHeadlineText(headline);
  if (!text) return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"/>`;
  const f = headlineFont();
  const pad = Math.round(W * 0.07);
  const { size, lines } = fitHeadline(text, (s) => (str) => f.getAdvanceWidth(str, s), W - pad * 2, {
    maxSize: Math.round(W * 0.092),
    minSize: Math.round(W * 0.058),
  });
  const lineHeight = Math.round(size * 1.08);
  const bottom = H - bottomGap;
  const firstBaseline = bottom - lineHeight * (lines.length - 1);
  const barTop = firstBaseline - Math.round(size * 0.95) - Math.round(W * 0.04);
  const fadeTop = Math.max(0, barTop - Math.round(H * 0.22));
  const textPaths = lines
    .map((line, n) => f.getPath(line, pad, firstBaseline + n * lineHeight, size).toPathData(1))
    .join(' ');
  const shadow = Math.max(2, Math.round(size * 0.04));
  const hexR = Math.round(W * 0.017);
  const hexCy = barTop + Math.round(W * 0.006);
  const lineX = pad + hexR * 2 + Math.round(W * 0.012);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${VOID}" stop-opacity="0"/>
      <stop offset="0.4" stop-color="${VOID}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0.9"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.1" cy="1" r="0.75">
      <stop offset="0" stop-color="${DEEP}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${DEEP}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="combFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#fff" stop-opacity="1"/>
    </linearGradient>
    <mask id="combMask"><rect x="0" y="${fadeTop}" width="${W}" height="${H - fadeTop}" fill="url(#combFade)"/></mask>
    ${honeycombPattern('comb', W / 540, 0.22)}
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${HOT}"/>
      <stop offset="1" stop-color="${MAGENTA}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${fadeTop}" width="${W}" height="${H - fadeTop}" fill="url(#fade)"/>
  <rect x="0" y="${fadeTop}" width="${W}" height="${H - fadeTop}" fill="url(#glow)"/>
  <rect x="0" y="${fadeTop}" width="${W}" height="${H - fadeTop}" fill="url(#comb)" mask="url(#combMask)"/>
  <polygon points="${hexPoints(pad + hexR, hexCy, hexR)}" fill="${MAGENTA}"/>
  <rect x="${lineX}" y="${hexCy - Math.max(1, Math.round(W * 0.002))}" width="${Math.round(W * 0.16)}" height="${Math.max(2, Math.round(W * 0.004))}" fill="url(#line)"/>
  <path d="${textPaths}" fill="#000" fill-opacity="0.35" transform="translate(${shadow * 0.6} ${shadow})"/>
  <path d="${textPaths}" fill="#fff"/>
</svg>`;
}

// The logo on a hex plate (the app's HexIcon device: a hexagon with a
// magenta gradient border), `height` px high, as a PNG. The face is light,
// since the logo itself is dark.
export async function logoBadge(height) {
  const r = height / 2;
  const w = Math.round(height * 0.866);
  const cx = w / 2;
  const border = Math.max(2, height * 0.045);
  const logoH = Math.round(height * 0.6);
  const logo = await sharp(Buffer.from(LOGO_PNG_BASE64, 'base64')).resize({ height: logoH }).toBuffer();
  const { width: logoW } = await sharp(logo).metadata();
  const plate = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}">
  <defs><linearGradient id="rim" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="${HOT}"/><stop offset="0.55" stop-color="${MAGENTA}"/><stop offset="1" stop-color="${DEEP}"/>
  </linearGradient></defs>
  <polygon points="${hexPoints(cx, r, r)}" fill="url(#rim)"/>
  <polygon points="${hexPoints(cx, r, r - border / 0.866)}" fill="#fff"/>
</svg>`;
  return sharp(Buffer.from(plate))
    .composite([{ input: logo, left: Math.round((w - logoW) / 2), top: Math.round((height - logoH) / 2) }])
    .png()
    .toBuffer();
}

// image: the photo as it'll be posted (already upright and inside
// Instagram's ratios); returns a JPEG. maxWidth shrinks it first, for the
// preview. logo 'center' puts the logo in the middle at the top (on a
// Before / After's seam, lib/socialLayout.js) instead of the corner.
export async function renderCover(image, headline, { maxWidth = 1440, quality = 90, logo = 'left' } = {}) {
  const base = await sharp(image).rotate().resize({ width: maxWidth, withoutEnlargement: true }).toBuffer();
  const { width: W, height: H } = await sharp(base).metadata();
  const margin = Math.round(W * 0.045);
  const badgeH = Math.round(W * 0.15);
  return sharp(base)
    .composite([
      { input: Buffer.from(headlineSvg(W, H, headline)), left: 0, top: 0 },
      { input: await logoBadge(badgeH), left: logo === 'center' ? Math.round((W - badgeH * 0.866) / 2) : margin, top: margin },
    ])
    .jpeg({ quality })
    .toBuffer();
}

// Reels: Instagram's buttons and caption cover the bottom of the frame and
// the profile grid shows only the middle 3:4, so text stays inside that.
const REEL_SAFE_BOTTOM = 0.22; // of the height
const REEL_SAFE_TOP = 0.14;

// The text layer for one photo of a Reel (lib/socialReel.js), as a
// transparent PNG: the first photo gets the cover's headline and the logo
// (it's the thumbnail too), the others a short line on the app's dark
// cut-corner card.
export async function renderReelOverlay(W, H, text, { first = false } = {}) {
  const layers = [];
  if (first) {
    layers.push({ input: Buffer.from(headlineSvg(W, H, text, { bottomGap: Math.round(H * REEL_SAFE_BOTTOM) })), left: 0, top: 0 });
    layers.push({ input: await logoBadge(Math.round(W * 0.13)), left: Math.round(W * 0.06), top: Math.round(H * REEL_SAFE_TOP) });
  } else {
    const line = coverHeadlineText(text);
    if (line) {
      const f = headlineFont();
      const padX = Math.round(W * 0.05);
      const { size, lines } = fitHeadline(line, (s) => (str) => f.getAdvanceWidth(str, s), W * 0.8 - padX * 2, {
        maxSize: Math.round(W * 0.062),
        minSize: Math.round(W * 0.045),
        maxLines: 2,
      });
      const lineHeight = Math.round(size * 1.18);
      const boxW = Math.round(Math.max(...lines.map((l) => f.getAdvanceWidth(l, size))) + padX * 2);
      const boxH = Math.round(lineHeight * lines.length + size * 0.55);
      const boxX = Math.round((W - boxW) / 2);
      const boxY = Math.round(H * (1 - REEL_SAFE_BOTTOM) - boxH);
      const paths = lines
        .map((l, n) => f.getPath(l, Math.round((W - f.getAdvanceWidth(l, size)) / 2), boxY + Math.round(size * 0.3) + size + n * lineHeight - Math.round(size * 0.12), size).toPathData(1))
        .join(' ');
      // The app's cut-corner card: dark, a magenta hairline, a small hexagon.
      const c = Math.round(size * 0.55);
      const card = [
        [boxX, boxY], [boxX + boxW - c, boxY], [boxX + boxW, boxY + c],
        [boxX + boxW, boxY + boxH], [boxX + c, boxY + boxH], [boxX, boxY + boxH - c],
      ].map(([x, y]) => `${x},${y}`).join(' ');
      const hexR = Math.round(size * 0.16);
      layers.push({
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <polygon points="${card}" fill="${VOID}" fill-opacity="0.78" stroke="${HOT}" stroke-opacity="0.55" stroke-width="${Math.max(2, Math.round(W * 0.002))}"/>
  <polygon points="${hexPoints(boxX + Math.round(padX * 0.45), boxY + Math.round(boxH / 2), hexR)}" fill="${MAGENTA}"/>
  <path d="${paths}" fill="${CHALK}"/>
</svg>`),
        left: 0,
        top: 0,
      });
    }
  }
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png()
    .toBuffer();
}

// Subtitles over a Reel clip (lib/socialSubtitlesPlan.js): one group of
// words, centred above the clip's own line, white with a dark edge and the
// word being said (index `active`) in the app's pink, as a transparent PNG
// to lay over the clip's text layer.
export async function renderSubtitles(W, H, words, active) {
  const f = headlineFont();
  const size = Math.round(W * 0.074);
  const space = f.getAdvanceWidth(' ', size);
  const shown = words.map((w) => coverHeadlineText(w)).map((w, k) => ({ w, k })).filter((x) => x.w);
  // Two lines at most, broken where the words stop fitting.
  const maxW = W * 0.84;
  const lines = [[]];
  let lineW = 0;
  for (const x of shown) {
    const w = f.getAdvanceWidth(x.w, size);
    if (lines[lines.length - 1].length && lineW + space + w > maxW) {
      lines.push([]);
      lineW = 0;
    }
    lineW += (lines[lines.length - 1].length ? space : 0) + w;
    lines[lines.length - 1].push({ ...x, width: w });
  }
  const lineHeight = Math.round(size * 1.2);
  const bottom = Math.round(H * 0.6);
  const parts = lines.map((line, n) => {
    const total = line.reduce((a, x) => a + x.width, 0) + space * Math.max(0, line.length - 1);
    let x = (W - total) / 2;
    const y = bottom - lineHeight * (lines.length - 1 - n);
    return line
      .map((word) => {
        const d = f.getPath(word.w, x, y, size).toPathData(1);
        x += word.width + space;
        return `<path d="${d}" fill="${word.k === active ? HOT : '#fff'}" stroke="${VOID}" stroke-width="${Math.round(size * 0.16)}" stroke-linejoin="round" paint-order="stroke"/>`;
      })
      .join('');
  });
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`)).png().toBuffer();
}

// The Reel's last two seconds, in the app's Hexfield look: near-black with
// the honeycomb and a magenta glow, the logo on a hex plate,
// "@europetsclinic" and a small "FOLLOW FOR MORE" label, as a JPEG.
export async function renderReelEndCard(W, H, handle) {
  const f = headlineFont();
  const badgeH = Math.round(W * 0.34);
  const badge = await logoBadge(badgeH);
  const { width: badgeW } = await sharp(badge).metadata();
  const badgeTop = Math.round(H * 0.32);
  const handleText = coverHeadlineText(`@${handle}`);
  const handleSize = Math.round(W * 0.075);
  const handleY = badgeTop + badgeH + Math.round(H * 0.085);
  const handleX = Math.round((W - f.getAdvanceWidth(handleText, handleSize)) / 2);
  const label = monoLabel('Follow for more', W / 2, handleY + Math.round(handleSize * 1.1), Math.round(W * 0.034));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    ${honeycombPattern('comb', W / 540, 0.16)}
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="${MAGENTA}" stop-opacity="0.42"/>
      <stop offset="0.6" stop-color="${DEEP}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${VOID}"/>
  <rect width="${W}" height="${H}" fill="url(#comb)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <path d="${f.getPath(handleText, handleX, handleY, handleSize).toPathData(1)}" fill="${CHALK}"/>
  <path d="${label.d}" fill="${BLUSH}"/>
</svg>`;
  return sharp(Buffer.from(svg))
    .composite([{ input: badge, left: Math.round((W - badgeW) / 2), top: badgeTop }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
