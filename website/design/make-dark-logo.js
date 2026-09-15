/* Two dark-ground logo files, built from the production artwork only.
   Run: node make-dark-logo.js

   1. logo-on-dark.png   — the stacked logo with its wordmark recoloured.
      The type is set in near-black with a slate sub-line, which is invisible
      on a dark ground. Only the wordmark is touched; the cross, dog and cat
      are left exactly as drawn. Alpha is preserved, so the type keeps its
      antialiasing over any background.

   2. logo-lockup-dark.png — the same two elements relocked side by side.
      A stacked mark-over-wordmark logo cannot read in a 4-5rem navigation
      bar: fit it to the bar's height and the type is a few pixels tall.
      No new artwork, just a horizontal arrangement of what already exists. */

const sharp = require('sharp');

const SRC = '/home/user/Europets/website/public/logo.png';
const WORDMARK_TOP = 900;          // the mark ends at 892, the type starts at 934
const PRIMARY = [246, 238, 242];   // EUROPETS -> chalk
const SECONDARY = [176, 166, 178]; // CLINIC + Arabic -> soft grey, keeps the hierarchy

function bbox(data, W, H, y0, y1) {
  let x0 = W, x1 = 0, t = H, b = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < t) t = y; if (y > b) b = y;
    }
  }
  return { left: x0, top: t, width: x1 - x0 + 1, height: b - t + 1 };
}

(async () => {
  const { data, info } = await sharp(SRC).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  let touched = 0;
  for (let y = WORDMARK_TOP; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] === 0) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (0.2126 * r + 0.7152 * g + 0.0722 * b > 150) continue;   // already light
      const c = (b - r > 12) ? SECONDARY : PRIMARY;               // slate sub-line vs wordmark
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
      touched++;
    }
  }
  console.log('recoloured', touched, 'wordmark pixels');

  const raw = { raw: { width: W, height: H, channels: 4 } };
  await sharp(data, raw).png().toFile('logo-on-dark.png');

  const mark = bbox(data, W, H, 0, WORDMARK_TOP);
  const word = bbox(data, W, H, WORDMARK_TOP, H);
  console.log('mark', JSON.stringify(mark));
  console.log('word', JSON.stringify(word));

  const MARK_H = 300;
  const markBuf = await sharp(data, raw).extract(mark).resize({ height: MARK_H }).png().toBuffer();
  const markW = Math.round(mark.width * (MARK_H / mark.height));

  const wordH = Math.round(MARK_H * 0.52);   // type at about half the mark, optically balanced
  const wordBuf = await sharp(data, raw).extract(word).resize({ height: wordH }).png().toBuffer();
  const wordW = Math.round(word.width * (wordH / word.height));

  const GAP = Math.round(MARK_H * 0.11);
  const outW = markW + GAP + wordW;

  await sharp({ create: { width: outW, height: MARK_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: markBuf, left: 0, top: 0 },
      { input: wordBuf, left: markW + GAP, top: Math.round((MARK_H - wordH) / 2) },
    ])
    .png().toFile('logo-lockup-dark.png');
  console.log('logo-lockup-dark.png', outW + 'x' + MARK_H, '(ratio ' + (outW / MARK_H).toFixed(3) + ')');
})();
