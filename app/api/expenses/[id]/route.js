// app/api/expenses/[id]/route.js
// PATCH  /api/expenses/:id  -> edit an expense
// DELETE /api/expenses/:id  -> remove an expense

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

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { expense_date, vendor_name, description, category, amount, vat_amount, payment_method } = body;

  if (category !== undefined && category !== null && !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of ${CATEGORIES.join(', ')}` }, { status: 400 });
  }
  if (payment_method !== undefined && payment_method !== null && !PAYMENT_METHODS.includes(payment_method)) {
    return NextResponse.json(
      { error: `payment_method must be one of ${PAYMENT_METHODS.join(', ')}` },
      { status: 400 }
    );
  }

  const update = {};
  if (expense_date !== undefined) update.expense_date = expense_date;
  if (vendor_name !== undefined) update.vendor_name = vendor_name;
  if (description !== undefined) update.description = description;
  if (category !== undefined) update.category = category;
  if (payment_method !== undefined) update.payment_method = payment_method;

  // amount/vat_amount need to be re-derived together so `total` stays
  // consistent even when only one of the two is being edited.
  if (amount !== undefined || vat_amount !== undefined) {
    const { data: existing, error: existingError } = await supabase
      .from('expenses')
      .select('amount, vat_amount')
      .eq('id', params.id)
      .single();
    if (existingError || !existing) {
      return NextResponse.json({ error: 'expense not found' }, { status: 404 });
    }
    const amountNum = amount !== undefined ? Number(amount) : Number(existing.amount);
    const vatNum = vat_amount !== undefined ? Number(vat_amount) : Number(existing.vat_amount);
    update.amount = amountNum;
    update.vat_amount = vatNum;
    update.total = amountNum + vatNum;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('expenses')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabase.from('expenses').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
