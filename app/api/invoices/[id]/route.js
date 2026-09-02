// app/api/invoices/[id]/route.js
// GET   /api/invoices/:id  -> invoice with line items
// PATCH /api/invoices/:id  -> update status (unpaid, paid, void); marking
//                             paid requires payment_method (cash, card,
//                             bank_transfer, payment_link) so the
//                             accounting overview can break down receipts
//                             by how they came in.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const VALID_STATUSES = ['unpaid', 'paid', 'void'];
const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'payment_link'];

export async function GET(request, { params }) {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(
      '*, clients(full_name, phone, email), visits(patients(name)), hospitalizations(patients(name))'
    )
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  const { data: lineItems, error: itemsError } = await supabase
    .from('invoice_line_items')
    .select('*, goods_services(name, pricing_type, unit, main_category)')
    .eq('invoice_id', params.id);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ ...invoice, line_items: lineItems });
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status, payment_method } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const update = { status };
  if (status === 'paid') {
    if (!payment_method || !PAYMENT_METHODS.includes(payment_method)) {
      return NextResponse.json(
        { error: `marking an invoice paid requires payment_method to be one of ${PAYMENT_METHODS.join(', ')}` },
        { status: 400 }
      );
    }
    update.payment_method = payment_method;
    update.paid_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
