// app/api/proforma-invoices/[id]/items/[itemId]/route.js
// PATCH  /api/proforma-invoices/:id/items/:itemId  { quantity } -> correct
//        a quoted quantity, recomputing line_total and the administration
//        fee fresh (see stripAdministrationFeeTag) so an edit never stacks
//        or leaves a stale fee tag.
// DELETE /api/proforma-invoices/:id/items/:itemId  -> remove a quoted item

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { applyAdministrationFee, stripAdministrationFeeTag } from '@/lib/invoicing';

export async function PATCH(request, { params }) {
  const body = await request.json();
  const quantity = Number(body.quantity);
  if (Number.isNaN(quantity) || quantity <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 });
  }

  const { data: current, error: currentError } = await supabase
    .from('proforma_invoice_items')
    .select('*')
    .eq('id', params.itemId)
    .eq('proforma_invoice_id', params.id)
    .single();

  if (currentError || !current) {
    return NextResponse.json({ error: 'item not found' }, { status: 404 });
  }

  const unit_price = Number(current.unit_price);
  let line = {
    description: stripAdministrationFeeTag(current.description),
    line_total: Math.round(unit_price * quantity * 100) / 100,
  };
  if (current.administration_method) {
    const { data: clinicSettings } = await supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle();
    line = applyAdministrationFee(line, current.administration_method, clinicSettings);
  }

  const { data, error } = await supabaseAdmin
    .from('proforma_invoice_items')
    .update({ quantity, description: line.description, line_total: line.line_total })
    .eq('id', params.itemId)
    .select('*, goods_services(name, pricing_type, unit, main_category)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request, { params }) {
  const { error } = await supabaseAdmin
    .from('proforma_invoice_items')
    .delete()
    .eq('id', params.itemId)
    .eq('proforma_invoice_id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
