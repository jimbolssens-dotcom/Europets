// app/api/invoices/[id]/line-items/route.js
// POST /api/invoices/:id/line-items  -> add a line item, recomputing invoice totals
//
// quantity means: units for 'flat'/'per_unit' pricing, kg of bodyweight for
// 'per_kg' pricing. If the invoice is linked to a visit and quantity is
// omitted for a per_kg item, the patient's current weight is used.
//
// For a medication added straight to an invoice (bypassing the treatment
// plan), administration_method (dispense/sc/im) adds a second line for
// that method's fee, same as the treatment-plan -> invoice flow — see
// lib/invoicing.js.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { recomputeInvoiceTotals, administrationFeeLineItem } from '@/lib/invoicing';

const ADMINISTRATION_METHODS = ['dispense', 'sc', 'im'];

export async function POST(request, { params }) {
  const body = await request.json();
  const { goods_service_id, quantity, description, administration_method } = body;

  if (!goods_service_id) {
    return NextResponse.json({ error: 'goods_service_id is required' }, { status: 400 });
  }
  if (administration_method && !ADMINISTRATION_METHODS.includes(administration_method)) {
    return NextResponse.json(
      { error: `administration_method must be one of ${ADMINISTRATION_METHODS.join(', ')}` },
      { status: 400 }
    );
  }

  const { data: item, error: itemError } = await supabase
    .from('goods_services')
    .select('*')
    .eq('id', goods_service_id)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: 'goods/service not found' }, { status: 400 });
  }
  if (administration_method && !item[`allow_${administration_method}`]) {
    return NextResponse.json(
      { error: 'this catalog item does not support that administration method' },
      { status: 400 }
    );
  }

  let qty = quantity !== undefined && quantity !== null ? Number(quantity) : null;

  if (qty === null && item.pricing_type === 'per_kg') {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('visit_id, visits(patient_id, patients(current_weight_kg))')
      .eq('id', params.id)
      .single();
    qty = invoice?.visits?.patients?.current_weight_kg ?? null;
  }
  if (qty === null) qty = 1;

  if (Number.isNaN(qty) || qty <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 });
  }

  const unit_price = Number(item.base_price);
  const line_total = Math.round(unit_price * qty * 100) / 100;

  const rows = [
    {
      invoice_id: params.id,
      goods_service_id,
      description: description || item.name,
      quantity: qty,
      unit_price,
      line_total,
    },
  ];

  if (administration_method) {
    const { data: clinicSettings } = await supabase
      .from('clinic_settings')
      .select('*')
      .eq('id', true)
      .maybeSingle();
    const feeLine = administrationFeeLineItem({ administration_method }, clinicSettings, params.id);
    if (feeLine) rows.push(feeLine);
  }

  const { data: lineItems, error: insertError } = await supabase.from('invoice_line_items').insert(rows).select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: totalsError } = await recomputeInvoiceTotals(supabase, params.id);
  if (totalsError) {
    return NextResponse.json({ error: totalsError.message }, { status: 500 });
  }

  return NextResponse.json(lineItems[0], { status: 201 });
}
