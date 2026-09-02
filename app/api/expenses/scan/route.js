// app/api/expenses/scan/route.js
// POST /api/expenses/scan  -> read a photo of a supplier receipt/invoice
// (FormData: `image`) and return { vendor_name, expense_date, amount,
// vat_amount, category }. Doesn't save anything — the caller fills in the
// expense form and attaches the photo itself, same pattern as
// /api/clients/scan-id.

import { extractExpenseReceipt } from '@/lib/anthropicClient';
import { NextResponse } from 'next/server';
import convert from 'heic-convert';

export const maxDuration = 60;

const HEIC_RE = /hei[cf]/i;

function looksLikeHeic(file, buffer) {
  if (HEIC_RE.test(file.type) || HEIC_RE.test(file.name || '')) return true;
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

    const result = await extractExpenseReceipt(buffer, mediaType);
    return NextResponse.json({ ...result, converted_image: convertedImage });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
