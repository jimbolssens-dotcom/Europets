// app/api/attachments/compress-sweep/route.js
// GET /api/attachments/compress-sweep -> compresses the next batch of
// photos that are ready (about 300 KB each, x-rays about 2 MB; see
// lib/attachmentCompression.js's compressPendingAttachments and migration
// 172 for which ones). Run every 10 minutes by Vercel Cron (vercel.json),
// so the backlog of full-size photos on closed cases drains over a few
// hours and new ones are shrunk shortly after their case closes.
// Authenticated with the CRON_SECRET bearer token like the other cron
// routes; anyone else gets a 401.

import { compressPendingAttachments } from '@/lib/attachmentCompression';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await compressPendingAttachments());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
