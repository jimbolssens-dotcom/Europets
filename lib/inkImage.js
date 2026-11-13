// lib/inkImage.js
// Turns a photo or scan of a signature or stamp into a clean transparent
// PNG, in the browser before upload (migration 251): scaled down, the
// paper made transparent, cropped tight to the ink. The ink keeps its own
// colour (a blue stamp stays blue).

// Pure part, tested in tests/ink-image.test.mjs: RGBA pixels in, alpha set
// from how dark each pixel is against the paper, plus the ink's bounding box.
export function inkify(data, width, height, { paper = null, cutoff = 40 } = {}) {
  const px = width * height;
  // The paper's brightness: the brighter end of the image (90th percentile).
  let ref = paper;
  if (ref == null) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < px; i++) {
      const o = i * 4;
      hist[Math.round((data[o] + data[o + 1] + data[o + 2]) / 3)] += 1;
    }
    let seen = 0;
    ref = 255;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen >= px * 0.9) {
        ref = v;
        break;
      }
    }
  }
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const lum = (data[o] + data[o + 1] + data[o + 2]) / 3;
      const dark = ref - lum; // how much darker than the paper
      let a = 0;
      // Solid once clearly darker; a soft edge in between keeps it smooth.
      if (dark > cutoff) a = Math.min(255, Math.round(((dark - cutoff) / 80) * 255));
      data[o + 3] = Math.min(data[o + 3], a);
      if (a > 60) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const box = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return { box, paper: ref };
}

// Browser only: a File -> data URL of the cleaned PNG.
export async function cleanInkImage(file, { maxSide = 900 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const { box } = inkify(image.data, w, h);
    if (!box) throw new Error('No ink found in that image. Use a photo of the signature on white paper.');
    ctx.putImageData(image, 0, 0);
    const pad = 4;
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    const cw = Math.min(w - x, box.w + pad * 2);
    const ch = Math.min(h - y, box.h + pad * 2);
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    out.getContext('2d').drawImage(canvas, x, y, cw, ch, 0, 0, cw, ch);
    return out.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
