// app/api/new-client-qr/route.js
// GET /api/new-client-qr -> a PNG QR code encoding /portal/intake/new
// (this same host), for printing and displaying at reception. Powers the
// QR code shown on the Invite page.

import QRCode from 'qrcode';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const targetUrl = new URL('/portal/intake/new', request.url).toString();
  const buffer = await QRCode.toBuffer(targetUrl, {
    width: 640,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  });
}
