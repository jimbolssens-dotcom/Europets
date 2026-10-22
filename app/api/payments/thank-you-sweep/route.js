// app/api/payments/thank-you-sweep/route.js
// GET -> applies rescuers' supporter bonuses (lib/supporterBonus.js) and
// money paid through clients' personal payment links to
// their unpaid invoices (lib/clientCredit.js, migration 213), then sends
// the thank-you WhatsApp for new online payments (lib/paymentThankYou.js). Vercel Cron every 10 minutes, CRON_SECRET
// bearer like the other cron routes; anyone else gets a 401.

import { sendPaymentThankYous } from '@/lib/paymentThankYou';
import { applyClientCredits } from '@/lib/clientCredit';
import { applySupporterBonuses } from '@/lib/supporterBonus';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // A rescuer's supporter bonus goes on their bills first (migration 215),
  // then the gift itself, so a payment made through a personal link is
  // thanked this round.
  const bonus = await applySupporterBonuses().catch((err) => ({ error: err.message }));
  const credit = await applyClientCredits().catch((err) => ({ error: err.message }));
  try {
    return NextResponse.json({ ...(await sendPaymentThankYous()), bonus, credit });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
