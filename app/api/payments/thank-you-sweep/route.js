// app/api/payments/thank-you-sweep/route.js
// GET -> sends the thank-you WhatsApp for new online payments
// (lib/paymentThankYou.js). Vercel Cron every 10 minutes, CRON_SECRET
// bearer like the other cron routes; anyone else gets a 401.

import { sendPaymentThankYous } from '@/lib/paymentThankYou';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendPaymentThankYous());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
