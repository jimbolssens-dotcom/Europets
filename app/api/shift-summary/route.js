// app/api/shift-summary/route.js
// GET /api/shift-summary?date=YYYY-MM-DD&shift=morning|afternoon&cutoff=HH:MM
//   -> every payment logged in that half-day window, so reception can
//      count their till against what the system says came in.
//
// Deliberately outside /api/accounting — reception runs this every
// shift and doesn't have the accounting password (see middleware.js),
// so this stays unauthenticated like the rest of the staff app.
//
// "date"/"shift"/"cutoff" are all interpreted in UAE local time (UTC+4,
// no DST) regardless of what timezone the server process itself runs in
// — this matters here specifically (unlike the month-level summary)
// because a shift boundary is checked multiple times a day and a few
// hours' skew would put payments in the wrong half.
//
// cutoff (default 14:00) is the clinic's own midday changeover — not
// configured anywhere, just a per-lookup control on the page — so
// "morning" is [00:00, cutoff) and "afternoon" is [cutoff, 24:00) for
// that date.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'payment_link'];

function uaeIso(date, time) {
  return `${date}T${time}:00.000+04:00`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const shift = searchParams.get('shift');
  const cutoff = searchParams.get('cutoff') || '14:00';

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (shift !== 'morning' && shift !== 'afternoon') {
    return NextResponse.json({ error: 'shift must be "morning" or "afternoon"' }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(cutoff)) {
    return NextResponse.json({ error: 'cutoff must be HH:MM' }, { status: 400 });
  }

  const dayStart = new Date(uaeIso(date, '00:00'));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const cutoffAt = new Date(uaeIso(date, cutoff));

  const start = shift === 'morning' ? dayStart : cutoffAt;
  const end = shift === 'morning' ? cutoffAt : dayEnd;

  const { data: payments, error } = await supabase
    .from('invoice_payments')
    .select('*, staff(full_name), invoices(invoice_number, clients(full_name))')
    .gte('paid_at', start.toISOString())
    .lt('paid_at', end.toISOString())
    .order('paid_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totalsByMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, { total: 0, count: 0 }]));
  let total = 0;
  for (const p of payments) {
    const amt = Number(p.amount || 0);
    total += amt;
    if (totalsByMethod[p.payment_method]) {
      totalsByMethod[p.payment_method].total += amt;
      totalsByMethod[p.payment_method].count += 1;
    }
  }

  return NextResponse.json({
    date,
    shift,
    cutoff,
    window: { start: start.toISOString(), end: end.toISOString() },
    total: Math.round(total * 100) / 100,
    count: payments.length,
    totals_by_method: totalsByMethod,
    payments,
  });
}
