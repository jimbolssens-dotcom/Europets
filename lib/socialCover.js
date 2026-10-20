// lib/socialCover.js
// Server-side: the cover photo of a Social post with its headline laid over
// it (migration 206): a dark fade at the bottom, a short pink bar, the
// headline in Fraunces (the client app's display font) and the logo in a
// white badge in the corner. The text is drawn as shapes from the embedded
// font, since Vercel's servers have no fonts for sharp to use.
//
// Used for the live preview on the draft (app/api/social-posts/[id]/cover)
// and for the photo that actually goes out (lib/metaSocial.js), so what
// staff approve is what's posted. Reels made from the photos
// (lib/socialReel.js) use the same headline, logo and font.

import sharp from 'sharp';
import opentype from 'opentype.js';
import { FRAUNCES_800_WOFF_BASE64 } from '@/lib/coverAssets/fraunces800';
import { LOGO_PNG_BASE64 } from '@/lib/coverAssets/logo';
import { cleanHeadline, fitHeadline } from '@/lib/socialCoverLayout';
import { fitInstagramRatio } from '@/lib/socialPublishPlan';

const PINK = '#e6186d';

let font;
function headlineFont() {
  if (!font) {
    const buf = Buffer.from(FRAUNCES_800_WOFF_BASE64, 'base64');
    font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return font;
}

export function coverHeadlineText(text) {
  const f = headlineFont();
  return cleanHeadline(text, (ch) => f.charToGlyphIndex(ch) > 0);
}

// The headline layer for a W x H frame, as SVG: a dark fade, a short pink
// bar and the text. bottomGap is how far above the bottom edge the last line
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.4" stop-color="#000" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${fadeTop}" width="${W}" height="${H - fadeTop}" fill="url(#fade)"/>
  <rect x="${pad}" y="${barTop}" width="${Math.round(W * 0.11)}" height="${Math.max(4, Math.round(W * 0.012))}" rx="${Math.round(W * 0.006)}" fill="${PINK}"/>
  <path d="${textPaths}" fill="#000" fill-opacity="0.35" transform="translate(${shadow * 0.6} ${shadow})"/>
  <path d="${textPaths}" fill="#fff"/>
</svg>`;
}

// The logo in a white rounded badge, `height` px high, as a PNG.
export async function logoBadge(height, opacity = 0.94) {
  const logoH = Math.round(height * 0.78);
  const logo = await sharp(Buffer.from(LOGO_PNG_BASE64, 'base64')).resize({ height: logoH }).toBuffer();
  const { width: logoW } = await sharp(logo).metadata();
  const badgeW = logoW + (height - logoH);
  return sharp({ create: { width: badgeW, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${badgeW}" height="${height}"><rect width="${badgeW}" height="${height}" rx="${Math.round(height * 0.22)}" fill="#fff" fill-opacity="${opacity}"/></svg>`
        ),
      },
      { input: logo, left: Math.round((badgeW - logoW) / 2), top: Math.round((height - logoH) / 2) },
    ])
    .png()
    .toBuffer();
}

// image: the photo as it'll be posted (already upright and inside
// Instagram's ratios); returns a JPEG. maxWidth shrinks it first, for the
// preview.
export async function renderCover(image, headline, { maxWidth = 1440, quality = 90 } = {}) {
  const base = await sharp(image).rotate().resize({ width: maxWidth, withoutEnlargement: true }).toBuffer();
  const { width: W, height: H } = await sharp(base).metadata();
  const margin = Math.round(W * 0.045);
  return sharp(base)
    .composite([
      { input: Buffer.from(headlineSvg(W, H, headline)), left: 0, top: 0 },
      { input: await logoBadge(Math.round(W * 0.15)), left: margin, top: margin },
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
// (it's the thumbnail too), the others a short line in a dark pill.
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
      layers.push({
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${Math.round(size * 0.45)}" fill="#1c1418" fill-opacity="0.62"/>
  <rect x="${boxX}" y="${boxY}" width="${Math.round(size * 0.18)}" height="${boxH}" rx="${Math.round(size * 0.09)}" fill="${PINK}"/>
  <path d="${paths}" fill="#fff"/>
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

// The Reel's last two seconds: the clinic pink, the logo, "@europetsclinic"
// and "Follow for more", as a JPEG.
export async function renderReelEndCard(W, H, handle) {
  const f = headlineFont();
  const badgeH = Math.round(W * 0.3);
  const badge = await logoBadge(badgeH, 1);
  const { width: badgeW } = await sharp(badge).metadata();
  const badgeTop = Math.round(H * 0.33);
  const centred = (str, size, y) => f.getPath(str, Math.round((W - f.getAdvanceWidth(str, size)) / 2), y, size).toPathData(1);
  const handleText = coverHeadlineText(`@${handle}`);
  const handleSize = Math.round(W * 0.075);
  const followSize = Math.round(W * 0.05);
  const handleY = badgeTop + badgeH + Math.round(H * 0.09);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><radialGradient id="g" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stop-color="#f0408a"/><stop offset="1" stop-color="#c8125c"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <path d="${centred(handleText, handleSize, handleY)}" fill="#fff"/>
  <path d="${centred('Follow for more', followSize, handleY + Math.round(handleSize * 1.15))}" fill="#fff" fill-opacity="0.85"/>
</svg>`;
  return sharp(Buffer.from(svg))
    .composite([{ input: badge, left: Math.round((W - badgeW) / 2), top: badgeTop }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// A phone photo straight from storage: upright, cropped into Instagram's
// ratios (as lib/metaSocial.js does for every photo), then the cover drawn.
export async function renderCoverFromOriginal(original, headline, options) {
  const upright = await sharp(original).rotate().toBuffer();
  const { width, height } = await sharp(upright).metadata();
  const cropped = await sharp(upright).extract(fitInstagramRatio(width, height)).toBuffer();
  return renderCover(cropped, headline, options);
}
