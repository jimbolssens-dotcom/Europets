// app/api/accounting/history/route.js
// GET /api/accounting/history -> the long-run figures on the Accounting
// Charts page (app/(admin)/accounting/charts): the old system's float sheets (migration
// 235) beside the app's own payments and expenses since, combined by
// lib/floatHistory.js. Behind the accounting password like the rest of
// /api/accounting (middleware.js).
//
// The float's day rows ship with the app (data/oldFloatDays.js, written by
// scripts/import-old-float.py). The first request that finds
// old_float_days short of them upserts them in: it only ever writes that
// one table, and running it again changes nothing.

import { NextResponse } from 'next/server';
import { selectAll } from '@/lib/selectAll';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { OLD_FLOAT_DAY_COLUMNS, OLD_FLOAT_DAYS_CSV } from '@/data/oldFloatDays';
import {
  APP_FIRST_FULL_MONTH,
  parseFloatDaysCsv,
  appMonths,
  combinedMonths,
  yearOnYear,
  dailyTakings,
  weekdayAverages,
  monthToDate,
  trailingYears,
  costMix,
} from '@/lib/floatHistory';

export const dynamic = 'force-dynamic';

async function loadFloatDays() {
  const rows = parseFloatDaysCsv(OLD_FLOAT_DAYS_CSV, OLD_FLOAT_DAY_COLUMNS);
  const { count, error } = await supabaseAdmin.from('old_float_days').select('sheet', { count: 'exact', head: true });
  if (error) return error;
  if ((count || 0) >= rows.length) return null;
  for (let i = 0; i < rows.length; i += 500) {
    const { error: upsertError } = await supabaseAdmin.from('old_float_days').upsert(rows.slice(i, i + 500), { onConflict: 'sheet,sheet_row' });
    if (upsertError) return upsertError;
  }
  return null;
}

export async function GET() {
  const loadError = await loadFloatDays();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

  // The app's side: from September 2026, when it started taking payments.
  const appStart = '2026-08-31T20:00:00.000Z';
  const [monthsRes, daysRes, payRes, legacyRes, expRes] = await Promise.all([
    supabaseAdmin.from('old_float_months').select('*').order('month'),
    selectAll(() =>
      supabaseAdmin
        .from('old_float_days')
        .select('sheet, sheet_row, day, shift, takings, stock, clinic_use, staff, con, other, card_spend')
        .order('sheet')
        .order('sheet_row')
    ),
    selectAll(() =>
      supabaseAdmin
        .from('invoice_payments')
        .select('id, amount, payment_method, paid_at, invoices!inner(status)')
        .neq('invoices.status', 'void')
        .gte('paid_at', appStart)
        .order('id')
    ),
    selectAll(() => supabaseAdmin.from('legacy_payments').select('id, amount, payment_method, paid_at').gte('paid_at', appStart).order('id')),
    selectAll(() => supabaseAdmin.from('expenses').select('id, total, expense_date').gte('expense_date', '2026-09-01').order('id')),
  ]);
  for (const res of [monthsRes, daysRes, payRes, legacyRes, expRes]) {
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  const now = Date.now();
  const floatMonths = monthsRes.data;
  const app = appMonths({ payments: payRes.data, legacyPayments: legacyRes.data, expenses: expRes.data });
  const months = combinedMonths({ floatMonths, app, now });
  const days = dailyTakings({ floatDays: daysRes.data, payments: payRes.data, legacyPayments: legacyRes.data });

  return NextResponse.json(
    {
      appFirstFullMonth: APP_FIRST_FULL_MONTH,
      months,
      yearOnYear: yearOnYear(months),
      weekdays: weekdayAverages(days),
      // Each day's takings, for the Charts page's "vs a year ago" by week.
      days: Object.fromEntries([...days].map(([d, t]) => [d, Math.round(t * 100) / 100])),
      monthToDate: monthToDate(days, now),
      trailing: trailingYears(months, now),
      costs: costMix({ floatDays: daysRes.data, floatMonths }),
      // Where the float's own figures differ from the rows they add up.
      corrections: floatMonths
        .filter((m) => (m.sheet_takings != null && Math.abs(m.sheet_takings - m.takings) > 1) || (m.sheet_net_profit != null && m.net_profit != null && Math.abs(m.sheet_net_profit - m.net_profit) > 1))
        .map((m) => ({ month: m.month, takings: m.takings, sheetTakings: m.sheet_takings, netProfit: m.net_profit, sheetNetProfit: m.sheet_net_profit })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
