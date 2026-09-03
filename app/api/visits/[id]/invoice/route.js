// app/api/visits/[id]/invoice/route.js
// POST /api/visits/:id/invoice -> create an invoice for this consult and
// import every treatment plan item (catalog item + quantity, as entered
// during the consult) as a line item — plus an automatic administration
// fee line for any medication that was dispensed/SC/IM (see
// lib/invoicing.js). If a non-void invoice already exists for this
// visit, that one is returned instead — no duplicates.

import { supabase } from '@/lib/supabaseClient';
import { recomputeInvoiceTotals, administrationFeeLineItem } from '@/lib/invoicing';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const visitId = params.id;

  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('visit_id', visitId)
    .neq('status', 'void')
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ id: existing.id, existing: true });
  }

  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .select('client_id')
    .eq('id', visitId)
    .single();

  if (visitError || !visit) {
    return NextResponse.json({ error: 'consult not found' }, { status: 404 });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert([{ client_id: visit.client_id, visit_id: visitId }])
    .select()
    .single();

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }

  const [{ data: treatmentItems }, { data: clinicSettings }] = await Promise.all([
    supabase.from('treatment_items').select('*, goods_services(id, name, base_price)').eq('visit_id', visitId),
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
  ]);

  const lineItems = (treatmentItems || [])
    .filter((item) => item.goods_services)
    .flatMap((item) => {
      const catalogItem = item.goods_services;
      const qty = Number(item.quantity) || 1;
      const unit_price = Number(catalogItem.base_price);
      const medicationLine = {
        invoice_id: invoice.id,
        goods_service_id: catalogItem.id,
        description: item.instructions ? `${catalogItem.name} — ${item.instructions}` : catalogItem.name,
        quantity: qty,
        unit_price,
        line_total: Math.round(unit_price * qty * 100) / 100,
      };
      const feeLine = administrationFeeLineItem(item, clinicSettings, invoice.id);
      return feeLine ? [medicationLine, feeLine] : [medicationLine];
    });

  if (lineItems.length > 0) {
    const { error: lineItemsError } = await supabase.from('invoice_line_items').insert(lineItems);
    if (lineItemsError) {
      return NextResponse.json({ error: lineItemsError.message }, { status: 500 });
    }
  }

  const { error: totalsError } = await recomputeInvoiceTotals(supabase, invoice.id);
  if (totalsError) {
    return NextResponse.json({ error: totalsError.message }, { status: 500 });
  }

  return NextResponse.json({ id: invoice.id, existing: false }, { status: 201 });
}
