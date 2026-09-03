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
//   - "collected" = every individual payment logged within the month
//     (invoice_payments.paid_at, not the invoice's created_at) — real
//     cash in the door, broken down by how it came in (cash/card/
//     bank_transfer/payment_link). Sourced from the payment log rather
//     than invoices.status='paid' so a partially paid invoice's
//     installments still count as they're actually collected, instead of
//     the whole invoice only showing up once the last installment lands.
// Each payment is VAT-inclusive (a slice of the invoice's total, not its
// subtotal), so the ex-VAT/VAT split below prorates it at the clinic's
// flat VAT_RATE rather than reading a per-payment VAT column.
// Net VAT due = invoiced output VAT minus input VAT on expenses dated in
// the same month (the standard output-minus-input FTA calculation).
// Net profit is cash-basis (money collected minus money spent this month)
// — simple and honest for a small clinic's day-to-day view, not a full
// accrual P&L.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { VAT_RATE } from '@/lib/invoicing';

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

  const [invoicedRes, paymentsRes, expensesRes, outstandingRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('subtotal, vat_amount, total')
      .neq('status', 'void')
      .gte('created_at', start)
      .lt('created_at', end),
    supabase
      .from('invoice_payments')
      .select('amount, payment_method, invoices!inner(status)')
      .neq('invoices.status', 'void')
      .gte('paid_at', start)
      .lt('paid_at', end),
    supabase.from('expenses').select('amount, vat_amount, total').gte('expense_date', dateStart).lt('expense_date', dateEnd),
    supabase.from('invoices').select('total, amount_paid').in('status', ['unpaid', 'partially_paid']),
  ]);

  for (const res of [invoicedRes, paymentsRes, expensesRes, outstandingRes]) {
    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }
  }

  const invoiced = invoicedRes.data;
  const payments = paymentsRes.data;
  const expenses = expensesRes.data;
  const outstanding = outstandingRes.data;

  const paymentsByMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0]));
  for (const p of payments) {
    if (p.payment_method && paymentsByMethod[p.payment_method] !== undefined) {
      paymentsByMethod[p.payment_method] += Number(p.amount || 0);
    }
  }

  const outputVatInvoiced = sum(invoiced, 'vat_amount');
  const inputVat = sum(expenses, 'vat_amount');
  const revenueCollectedInclVat = sum(payments, 'amount');
  const revenueCollected = Math.round((revenueCollectedInclVat / (1 + VAT_RATE)) * 100) / 100;
  const vatCollected = Math.round((revenueCollectedInclVat - revenueCollected) * 100) / 100;
  const expensesTotal = sum(expenses, 'amount');
  const unpaidTotal = outstanding.reduce(
    (total, inv) => total + (Number(inv.total || 0) - Number(inv.amount_paid || 0)),
    0
  );

  return NextResponse.json({
    month,
    revenue: { invoiced: sum(invoiced, 'subtotal'), collected: revenueCollected },
    vat: {
      output_invoiced: outputVatInvoiced,
      output_collected: vatCollected,
      input: inputVat,
      net_due: outputVatInvoiced - inputVat,
    },
    expenses: { total: expensesTotal, count: expenses.length },
    net_profit_cash_basis: revenueCollected - expensesTotal,
    payments_by_method: paymentsByMethod,
    unpaid: { total: unpaidTotal, count: outstanding.length },
  });
}
