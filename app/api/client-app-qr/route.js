// app/api/client-app-qr/route.js
// GET /api/client-app-qr -> a PNG QR code encoding /client-app (this same
// host), for printing and displaying at reception — scanning it opens the
// client-facing PWA's login screen, ready for "Add to Home Screen"/
// "Install app". Same shape as /api/new-client-qr; powers the second QR
// code shown on the Invite page.

import QRCode from 'qrcode';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const targetUrl = new URL('/client-app', request.url).toString();
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
