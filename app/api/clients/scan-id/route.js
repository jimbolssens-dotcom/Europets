// app/api/clients/scan-id/route.js
// POST /api/clients/scan-id  -> read a photo of an Emirates ID card
// (FormData: `image`) and return { full_name, emirates_id }. Doesn't save
// anything — the caller fills in the form and attaches the photo itself.

import { extractEmiratesId } from '@/lib/anthropicClient';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(request) {
  const formData = await request.formData();
  const image = formData.get('image');

  if (!image || typeof image === 'string') {
    return NextResponse.json({ error: 'image file is required' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const mediaType = image.type || 'image/jpeg';
    const result = await extractEmiratesId(buffer, mediaType);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
