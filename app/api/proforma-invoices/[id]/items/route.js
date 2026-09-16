// app/api/proforma-invoices/[id]/items/route.js
// POST /api/proforma-invoices/:id/items -> add an item, priced from the
// catalog exactly like a real invoice line item (including folding in the
// administration fee — see lib/invoicing.js#applyAdministrationFee) so the
// quoted total is a faithful estimate of what an actual invoice would
// later charge. quantity means: units for 'flat'/'per_unit' pricing, kg of
// bodyweight for 'per_kg' pricing (falls back to the patient's current
// weight when omitted, same as a real invoice).

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { applyAdministrationFee } from '@/lib/invoicing';
import { resolveAdministrationMethod } from '@/lib/administrationMethods';

export async function POST(request, { params }) {
  const body = await request.json();
  const { goods_service_id, quantity, description } = body;

  if (!goods_service_id) {
    return NextResponse.json({ error: 'goods_service_id is required' }, { status: 400 });
  }

  const { data: item, error: itemError } = await supabase
    .from('goods_services')
    .select('*')
    .eq('id', goods_service_id)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: 'goods/service not found' }, { status: 400 });
  }

  let qty = quantity !== undefined && quantity !== null ? Number(quantity) : null;

  if (qty === null && item.pricing_type === 'per_kg') {
    const { data: quote } = await supabase
      .from('proforma_invoices')
      .select('patients(current_weight_kg)')
      .eq('id', params.id)
      .single();
    qty = quote?.patients?.current_weight_kg ?? null;
  }
  if (qty === null) qty = 1;

  if (Number.isNaN(qty) || qty <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 });
  }

  const resolved = resolveAdministrationMethod(item.administration_method);
  const unit_price = Number(item.base_price);
  const line_total = Math.round(unit_price * qty * 100) / 100;

  let row = {
    proforma_invoice_id: params.id,
    goods_service_id,
    description: description || item.name,
    quantity: qty,
    unit_price,
    line_total,
    administration_method: resolved.administration_method,
  };

  if (resolved.administration_method) {
    const { data: clinicSettings } = await supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle();
    row = applyAdministrationFee(row, resolved.administration_method, clinicSettings);
  }

  const { data: lineItem, error: insertError } = await supabaseAdmin
    .from('proforma_invoice_items')
    .insert([row])
    .select('*, goods_services(name, pricing_type, unit, main_category)')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json(lineItem, { status: 201 });
}
