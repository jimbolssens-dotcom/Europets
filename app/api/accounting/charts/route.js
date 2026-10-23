// app/api/accounting/charts/route.js
// GET /api/accounting/charts?range=weeks|months -> the figures for the
// Accounting charts page (app/(admin)/accounting/charts), bucketed by
// lib/accountingCharts.js: the last 8 weeks by week, or the last 12 months by
// month, plus the last 12 months of takings and outgoing for the trend chart
// whichever range is picked, and the client app's login-code requests and
// logins (migration 128) with how many clients use it. Behind the accounting password like the rest of
// /api/accounting (middleware.js).

import { NextResponse } from 'next/server';
import { selectAll } from '@/lib/selectAll';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { bucketsUpTo, rangeStartIso, buildChartData, lineItemCategory, appLoginStats } from '@/lib/accountingCharts';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const unit = searchParams.get('range') === 'months' ? 'month' : 'week';
  const now = Date.now();
  const buckets = bucketsUpTo(now, unit, unit === 'month' ? 12 : 8);
  const months = bucketsUpTo(now, 'month', 12);
  // Fetch from whichever starts earlier: the picked range or the 12-month trend.
  const startKey = buckets[0] < months[0] ? buckets[0] : months[0];
  const start = rangeStartIso(startKey);
  const rangeStart = rangeStartIso(buckets[0]);

  const [payRes, legacyRes, invRes, lineRes, expRes, clientRes, unpaidRes] = await Promise.all([
    selectAll(() =>
      supabase
        .from('invoice_payments')
        .select('id, amount, payment_method, paid_at, invoices!inner(status)')
        .neq('invoices.status', 'void')
        .gte('paid_at', start)
        .order('id')
    ),
    // Server-only table (RLS on, no public policy, migration 187).
    selectAll(() => supabaseAdmin.from('legacy_payments').select('id, amount, payment_method, paid_at').gte('paid_at', start).order('id')),
    selectAll(() =>
      supabase
        .from('invoices')
        .select('id, total, discount_amount, created_at, visit_id')
        .neq('status', 'void')
        .gte('created_at', rangeStart)
        .order('id')
    ),
    selectAll(() =>
      supabase
        .from('invoice_line_items')
        .select('id, line_total, goods_services(main_category, catalog_subcategories(name)), invoices!inner(status, created_at)')
        .neq('invoices.status', 'void')
        .gte('invoices.created_at', rangeStart)
        .order('id')
    ),
    selectAll(() =>
      supabase.from('expenses').select('id, total, category, expense_date').gte('expense_date', startKey).order('id')
    ),
    selectAll(() =>
      supabase.from('clients').select('id, client_number, created_at').gte('created_at', rangeStart).order('id')
    ),
    selectAll(() =>
      supabase.from('invoices').select('id, total, amount_paid, created_at').in('status', ['unpaid', 'partially_paid']).order('id')
    ),
  ]);
  for (const res of [payRes, legacyRes, invRes, lineRes, expRes, clientRes, unpaidRes]) {
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  // Each invoice's vet: the attending vet of the consult it came from.
  const visitIds = [...new Set(invRes.data.map((i) => i.visit_id).filter(Boolean))];
  const vetByVisit = new Map();
  for (let i = 0; i < visitIds.length; i += 200) {
    const { data, error } = await supabase.from('visits').select('id, attending_vet_id').in('id', visitIds.slice(i, i + 200));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const v of data || []) vetByVisit.set(v.id, v.attending_vet_id);
  }
  const { data: staff } = await supabase.from('staff').select('id, full_name');
  const staffName = new Map((staff || []).map((s) => [s.id, String(s.full_name || '').replace(/\s+/g, ' ').trim()]));

  const data = buildChartData({
    unit,
    buckets,
    now,
    payments: payRes.data,
    legacyPayments: legacyRes.data,
    invoices: invRes.data.map((i) => ({ ...i, vet_name: staffName.get(vetByVisit.get(i.visit_id)) || null })),
    lineItems: lineRes.data.map((li) => ({ line_total: li.line_total, category: lineItemCategory(li.goods_services), created_at: li.invoices?.created_at })),
    expenses: expRes.data,
    clients: clientRes.data,
    unpaid: unpaidRes.data,
  });
  // The client app: who asked for a login code, who logged in, who uses it.
  const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [codesRes, { data: staffPhones }, { count: usedEver }, { count: used30 }] = await Promise.all([
    selectAll(() => supabaseAdmin.from('client_otp_codes').select('id, phone, created_at, consumed_at, attempts').order('id')),
    supabaseAdmin.from('staff').select('whatsapp_phone').not('whatsapp_phone', 'is', null),
    supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).not('client_app_last_seen_at', 'is', null),
    supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).gte('client_app_last_seen_at', since30),
  ]);
  if (codesRes.error) return NextResponse.json({ error: codesRes.error.message }, { status: 500 });
  const app = appLoginStats({ codes: codesRes.data, unit, buckets, staffPhones: (staffPhones || []).map((s) => s.whatsapp_phone) });
  const trend = buildChartData({ unit: 'month', buckets: months, now, payments: payRes.data, legacyPayments: legacyRes.data, expenses: expRes.data });

  return NextResponse.json(
    {
      ...data,
      trend: { buckets: months, takings: trend.takingsTotal, outgoing: trend.outgoing },
      app: { ...app, totals: { ...app.totals, usedEver: usedEver || 0, used30: used30 || 0 } },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
