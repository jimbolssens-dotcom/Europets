// lib/socialCover.js
// Server-side: the cover photo of a Social post with its headline laid over
// it (migration 206): a dark fade at the bottom, a short pink bar, the
// headline in Fraunces (the client app's display font) and the logo in a
// white badge in the corner. The text is drawn as shapes from the embedded
// font, since Vercel's servers have no fonts for sharp to use.
//
// Used for the live preview on the draft (app/api/social-posts/[id]/cover)
// and for the photo that actually goes out (lib/metaSocial.js), so what
// staff approve is what's posted.

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

// image: the photo as it'll be posted (already upright and inside
// Instagram's ratios); returns a JPEG. maxWidth shrinks it first, for the
// preview.
export async function renderCover(image, headline, { maxWidth = 1440, quality = 90 } = {}) {
  const base = await sharp(image).rotate().resize({ width: maxWidth, withoutEnlargement: true }).toBuffer();
  const { width: W, height: H } = await sharp(base).metadata();
  const text = coverHeadlineText(headline);
  const f = headlineFont();

  const pad = Math.round(W * 0.07);
  const { size, lines } = fitHeadline(text, (s) => (str) => f.getAdvanceWidth(str, s), W - pad * 2, {
    maxSize: Math.round(W * 0.092),
    minSize: Math.round(W * 0.058),
  });
  const lineHeight = Math.round(size * 1.08);
  const bottom = H - Math.round(W * 0.085);
  const firstBaseline = bottom - lineHeight * (lines.length - 1);
  const barTop = firstBaseline - Math.round(size * 0.95) - Math.round(W * 0.04);
  const fadeTop = Math.max(0, barTop - Math.round(H * 0.22));

  const textPaths = lines
    .map((line, n) => f.getPath(line, pad, firstBaseline + n * lineHeight, size).toPathData(1))
    .join(' ');
  const shadow = Math.max(2, Math.round(size * 0.04));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.4" stop-color="#000" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  ${text ? `<rect x="0" y="${fadeTop}" width="${W}" height="${H - fadeTop}" fill="url(#fade)"/>
  <rect x="${pad}" y="${barTop}" width="${Math.round(W * 0.11)}" height="${Math.max(4, Math.round(W * 0.012))}" rx="${Math.round(W * 0.006)}" fill="${PINK}"/>
  <path d="${textPaths}" fill="#000" fill-opacity="0.35" transform="translate(${shadow * 0.6} ${shadow})"/>
  <path d="${textPaths}" fill="#fff"/>` : ''}
</svg>`;

  // The logo in a white rounded badge, top left.
  const badgeH = Math.round(W * 0.15);
  const logoH = Math.round(badgeH * 0.78);
  const logo = await sharp(Buffer.from(LOGO_PNG_BASE64, 'base64')).resize({ height: logoH }).toBuffer();
  const { width: logoW } = await sharp(logo).metadata();
  const badgeW = logoW + (badgeH - logoH);
  const badge = await sharp({
    create: { width: badgeW, height: badgeH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${badgeW}" height="${badgeH}"><rect width="${badgeW}" height="${badgeH}" rx="${Math.round(badgeH * 0.22)}" fill="#fff" fill-opacity="0.94"/></svg>`
        ),
      },
      { input: logo, left: Math.round((badgeW - logoW) / 2), top: Math.round((badgeH - logoH) / 2) },
    ])
    .png()
    .toBuffer();
  const margin = Math.round(W * 0.045);

  return sharp(base)
    .composite([
      { input: Buffer.from(svg), left: 0, top: 0 },
      { input: badge, left: margin, top: margin },
    ])
    .jpeg({ quality })
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
