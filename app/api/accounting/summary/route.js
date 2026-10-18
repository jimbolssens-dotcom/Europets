// app/api/accounting/summary/route.js
// GET /api/accounting/summary?month=YYYY-MM  -> the month's books, laid out
// the way the clinic keeps them: total takings (new invoices AND old-system
// balances, by method), total outgoing, gross profit, net profit after the
// fixed monthly costs, and VAT collected / VAT takings / VAT paid / net VAT
// due. The rules live in lib/accountingSummary.js; this just fetches.
//
// Cash basis throughout: a payment counts in the month it was received
// (invoice_payments.paid_at, legacy_payments.paid_at), an expense in the
// month it's dated. Old-system payments carry VAT like any other takings:
// every FileMaker invoice was charged VAT, and it's paid over as clients
// pay off those balances.
// Invoice-date figures alongside: what was invoiced this month (with VAT,
// and how much of it is still unpaid), and discounts given; plus everything
// outstanding, whatever month it was invoiced in.

import { selectAll } from '@/lib/selectAll';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { buildMonthlyFigures } from '@/lib/accountingSummary';

// Next.js can otherwise cache a GET route handler's response — the books
// must reflect the ledger as it is now. See app/api/hospitalizations/[id]/route.js.
export const dynamic = 'force-dynamic';

function monthBounds(month) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(month);
  const dateStart = start.slice(0, 10);
  const dateEnd = end.slice(0, 10);

  // Every list is paged (lib/selectAll.js): one request stops at 1000 rows.
  const [invoicedRes, paymentsRes, expensesRes, outstandingRes, legacyRes] = await Promise.all([
    selectAll(() =>
      supabase
        .from('invoices')
        .select('id, status, subtotal, discount_amount, vat_amount, total, amount_paid')
        .neq('status', 'void')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('id')
    ),
    selectAll(() =>
      supabase
        .from('invoice_payments')
        .select('id, amount, payment_method, invoices!inner(status, total, vat_amount)')
        .neq('invoices.status', 'void')
        .gte('paid_at', start)
        .lt('paid_at', end)
        .order('id')
    ),
    selectAll(() =>
      supabase
        .from('expenses')
        .select('id, amount, vat_amount, total, category, fixed_cost')
        .gte('expense_date', dateStart)
        .lt('expense_date', dateEnd)
        .order('id')
    ),
    selectAll(() => supabase.from('invoices').select('id, total, amount_paid').in('status', ['unpaid', 'partially_paid']).order('id')),
    // Server-only table (RLS on, no public policy, migration 187).
    selectAll(() =>
      supabaseAdmin.from('legacy_payments').select('id, amount, payment_method').gte('paid_at', start).lt('paid_at', end).order('id')
    ),
  ]);

  for (const res of [invoicedRes, paymentsRes, expensesRes, outstandingRes, legacyRes]) {
    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }
  }

  const invoiced = invoicedRes.data;
  const outstanding = outstandingRes.data;
  const figures = buildMonthlyFigures({
    payments: paymentsRes.data,
    legacyPayments: legacyRes.data,
    expenses: expensesRes.data,
  });

  const discountsTotal = sum(invoiced, 'discount_amount');
  const balance = (inv) => Number(inv.total || 0) - Number(inv.amount_paid || 0);
  const unpaidTotal = outstanding.reduce((total, inv) => total + balance(inv), 0);
  // Of this month's invoices, what's still to be paid.
  const monthUnpaid = invoiced.filter((inv) => (inv.status === 'unpaid' || inv.status === 'partially_paid') && balance(inv) > 0.005);

  return NextResponse.json({
    month,
    ...figures,
    invoiced: {
      revenue_ex_vat: sum(invoiced, 'subtotal') - discountsTotal,
      vat: sum(invoiced, 'vat_amount'),
      total: sum(invoiced, 'total'),
      count: invoiced.length,
      outstanding: monthUnpaid.reduce((total, inv) => total + balance(inv), 0),
      outstanding_count: monthUnpaid.length,
    },
    discounts: { total: discountsTotal, count: invoiced.filter((inv) => Number(inv.discount_amount) > 0).length },
    unpaid: { total: unpaidTotal, count: outstanding.length },
  });
}
