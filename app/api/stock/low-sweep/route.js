// app/api/stock/low-sweep/route.js
// GET -> posts the low-stock alert (lib/stockKeeping.js) in the Stock team
// group (admin, reception and techs, migration 229): one message listing
// every item at or below its reorder level that hasn't been alerted for
// this drop, repeated weekly while it stays low. Items back above their
// level are cleared, so the next drop alerts again. Vercel Cron, hourly in
// clinic hours (vercel.json); public in middleware.js, verified with the
// same CRON_SECRET as the other cron routes.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { postTeamMessage } from '@/lib/teamChat';
import { lowItemsToAlert, itemsRestocked, lowStockMessage } from '@/lib/stockKeeping';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data: levels, error } = await supabaseAdmin.from('stock_levels').select('*').eq('active', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const restocked = itemsRestocked(levels);
  if (restocked.length) await supabaseAdmin.from('stock_items').update({ low_alert_sent_at: null }).in('id', restocked.map((l) => l.id));

  const due = lowItemsToAlert(levels);
  if (!due.length) return NextResponse.json({ alerted: 0, restocked: restocked.length });
  const result = await postTeamMessage('stock', null, { body: lowStockMessage(due), asApp: true });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  await supabaseAdmin.from('stock_items').update({ low_alert_sent_at: new Date().toISOString() }).in('id', due.map((l) => l.id));
  return NextResponse.json({ alerted: due.length, items: due.map((l) => l.name), restocked: restocked.length, on_whatsapp: result.on_whatsapp });
}
