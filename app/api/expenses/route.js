// app/api/expenses/route.js
// GET  /api/expenses?month=YYYY-MM&category=X  -> list expenses
// POST /api/expenses                           -> log a new expense
//
// amount is pre-VAT; total is computed server-side as amount + vat_amount
// (kept explicit/stored, same convention as invoices, rather than derived
// on every read).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const CATEGORIES = [
  'supplies',
  'rent',
  'utilities',
  'salaries',
  'equipment',
  'marketing',
  'professional_fees',
  'other',
];
const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'payment_link'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  const category = searchParams.get('category');

  let query = supabase.from('expenses').select('*').order('expense_date', { ascending: false });

  if (month) {
    const monthStart = `${month}-01`;
    const monthEndDate = new Date(`${month}-01T00:00:00Z`);
    monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    query = query.gte('expense_date', monthStart).lt('expense_date', monthEnd);
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { expense_date, vendor_name, description, category, amount, vat_amount, payment_method } = body;

  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    return NextResponse.json({ error: 'amount is required' }, { status: 400 });
  }
  if (category && !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of ${CATEGORIES.join(', ')}` }, { status: 400 });
  }
  if (payment_method && !PAYMENT_METHODS.includes(payment_method)) {
    return NextResponse.json(
      { error: `payment_method must be one of ${PAYMENT_METHODS.join(', ')}` },
      { status: 400 }
    );
  }

  const amountNum = Number(amount);
  const vatNum = Number(vat_amount) || 0;

  const { data, error } = await supabase
    .from('expenses')
    .insert([
      {
        expense_date: expense_date || undefined,
        vendor_name: vendor_name || null,
        description: description || null,
        category: category || 'other',
        amount: amountNum,
        vat_amount: vatNum,
        total: amountNum + vatNum,
        payment_method: payment_method || null,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
