// app/api/clients/scan-id/route.js
// POST /api/clients/scan-id  -> read a photo of an Emirates ID card
// (FormData: `image`) and return { full_name, emirates_id }. Doesn't save
// anything — the caller fills in the form and attaches the photo itself.

import { extractEmiratesId } from '@/lib/anthropicClient';
import { NextResponse } from 'next/server';
import convert from 'heic-convert';

export const maxDuration = 60;

// iPhones default to saving camera photos as HEIC, which Claude's vision
// API doesn't accept (only jpeg/png/gif/webp) — a photo picked from the
// gallery (rather than taken through the camera-capture input, which
// browsers normally hand back as JPEG) commonly comes through this way.
const HEIC_RE = /hei[cf]/i;

function looksLikeHeic(file, buffer) {
  if (HEIC_RE.test(file.type) || HEIC_RE.test(file.name || '')) return true;
  // Fall back to sniffing the ISO-BMFF 'ftyp' box — some browsers report no
  // (or a generic) type for HEIC files picked from the photo library.
  if (buffer.length > 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1)$/.test(brand)) return true;
  }
  return false;
}

export async function POST(request) {
  const formData = await request.formData();
  const image = formData.get('image');

  if (!image || typeof image === 'string') {
    return NextResponse.json({ error: 'image file is required' }, { status: 400 });
  }

  try {
    let buffer = Buffer.from(await image.arrayBuffer());
    let mediaType = image.type || 'image/jpeg';
    let convertedImage = null;

    if (looksLikeHeic(image, buffer)) {
      const jpegBytes = await convert({ buffer, format: 'JPEG', quality: 0.92 });
      buffer = Buffer.from(jpegBytes);
      mediaType = 'image/jpeg';
      convertedImage = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }

    const result = await extractEmiratesId(buffer, mediaType);
    return NextResponse.json({ ...result, converted_image: convertedImage });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
