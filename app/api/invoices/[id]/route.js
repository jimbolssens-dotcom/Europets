// app/api/invoices/[id]/route.js
// GET   /api/invoices/:id  -> invoice with line items and its payment log
// PATCH /api/invoices/:id  -> void an invoice. Marking one paid isn't a
//                             directly settable status anymore — it's
//                             derived automatically once logged payments
//                             (POST /api/invoices/:id/payments) add up to
//                             the total, so status can't drift from what
//                             was actually collected.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

const VALID_STATUSES = ['void'];

export async function GET(request, { params }) {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(
      '*, clients(full_name, phone, email), visits(patients(id, name)), hospitalizations(patients(id, name))'
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

  const { data: payments, error: paymentsError } = await supabase
    .from('invoice_payments')
    .select('*, staff(full_name)')
    .eq('invoice_id', params.id)
    .order('paid_at', { ascending: false });

  if (paymentsError) {
    return NextResponse.json({ error: paymentsError.message }, { status: 500 });
  }

  return NextResponse.json({ ...invoice, line_items: lineItems, payments });
}

export async function PATCH(request, { params }) {
  const body = await request.json();
  const { status } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('invoices')
    .update({ status })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
