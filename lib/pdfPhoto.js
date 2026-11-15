// lib/pdfPhoto.js
// A photo for a PDF report (hospital summary, consult and procedure
// reports). Photos used to go in at full camera resolution, several MB
// each, though they print as thumbnails of at most 120 pt (about 4 cm):
// a stay with a few dozen photos made a very large download (Jim, 15 Nov).
// Each is now turned upright, scaled to MAX_SIDE pixels (300 dpi or more at
// that size) and saved as a JPEG first.

import sharp from 'sharp';

export const MAX_SIDE = 600;

export async function shrinkPhotoForPdf(bytes, maxSide = MAX_SIDE) {
  return sharp(bytes)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
}

// Embeds one attachment photo ({ bytes, contentType, fileName }), shrunk;
// falls back to the original if it can't be read (rare formats), and
// skips it rather than failing the whole PDF.
export async function embedPdfPhoto(pdfDoc, photo) {
  try {
    return await pdfDoc.embedJpg(await shrinkPhotoForPdf(photo.bytes));
  } catch {
    const isPng = photo.contentType === 'image/png' || /\.png$/i.test(photo.fileName || '');
    try {
      return isPng ? await pdfDoc.embedPng(photo.bytes) : await pdfDoc.embedJpg(photo.bytes);
    } catch {
      return null;
    }
  }
}
