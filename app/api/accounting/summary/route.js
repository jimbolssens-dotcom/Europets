// app/api/accounting/summary/route.js
// GET /api/accounting/summary?month=YYYY-MM  -> a basic P&L + VAT summary
// for one calendar month, defaulting to the current month.
//
// Two different revenue/VAT numbers are reported side by side, since they
// answer different questions and this is meant to actually be useful for
// UAE VAT filing, not just a vanity dashboard:
//   - "invoiced" = every non-void invoice dated in the month, regardless
//     of whether it's been paid yet. This is what UAE VAT is due on (the
//     supply date), so it's the number that matters for the FTA return.
//   - "collected" = invoices actually marked paid within the month
//     (paid_at, not created_at). This is real cash in the door, broken
//     down by how it came in (cash/card/bank_transfer/payment_link).
// Net VAT due = invoiced output VAT minus input VAT on expenses dated in
// the same month (the standard output-minus-input FTA calculation).
// Net profit is cash-basis (money collected minus money spent this month)
// — simple and honest for a small clinic's day-to-day view, not a full
// accrual P&L.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'payment_link'];

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

  const [invoicedRes, collectedRes, expensesRes, unpaidRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('subtotal, vat_amount, total')
      .neq('status', 'void')
      .gte('created_at', start)
      .lt('created_at', end),
    supabase
      .from('invoices')
      .select('subtotal, vat_amount, total, payment_method')
      .eq('status', 'paid')
      .gte('paid_at', start)
      .lt('paid_at', end),
    supabase.from('expenses').select('amount, vat_amount, total').gte('expense_date', dateStart).lt('expense_date', dateEnd),
    supabase.from('invoices').select('total').eq('status', 'unpaid'),
  ]);

  for (const res of [invoicedRes, collectedRes, expensesRes, unpaidRes]) {
    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }
  }

  const invoiced = invoicedRes.data;
  const collected = collectedRes.data;
  const expenses = expensesRes.data;
  const unpaid = unpaidRes.data;

  const paymentsByMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0]));
  for (const inv of collected) {
    if (inv.payment_method && paymentsByMethod[inv.payment_method] !== undefined) {
      paymentsByMethod[inv.payment_method] += Number(inv.total || 0);
    }
  }

  const outputVatInvoiced = sum(invoiced, 'vat_amount');
  const inputVat = sum(expenses, 'vat_amount');
  const revenueCollected = sum(collected, 'subtotal');
  const expensesTotal = sum(expenses, 'amount');

  return NextResponse.json({
    month,
    revenue: { invoiced: sum(invoiced, 'subtotal'), collected: revenueCollected },
    vat: {
      output_invoiced: outputVatInvoiced,
      output_collected: sum(collected, 'vat_amount'),
      input: inputVat,
      net_due: outputVatInvoiced - inputVat,
    },
    expenses: { total: expensesTotal, count: expenses.length },
    net_profit_cash_basis: revenueCollected - expensesTotal,
    payments_by_method: paymentsByMethod,
    unpaid: { total: sum(unpaid, 'total'), count: unpaid.length },
  });
}
