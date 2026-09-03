// app/api/hospitalizations/[id]/invoice/route.js
// POST /api/hospitalizations/:id/invoice -> create an invoice for this
// admission and import every treatment item (medication/goods/service/test,
// with the quantity logged) as a line item — plus an automatic
// administration fee line for any medication that was dispensed/SC/IM
// (see lib/invoicing.js). If a non-void invoice already exists for this
// admission, that one is returned instead — no duplicates.

import { supabase } from '@/lib/supabaseClient';
import { recomputeInvoiceTotals, administrationFeeLineItem } from '@/lib/invoicing';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const hospitalizationId = params.id;

  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('hospitalization_id', hospitalizationId)
    .neq('status', 'void')
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ id: existing.id, existing: true });
  }

  const { data: admission, error: admissionError } = await supabase
    .from('hospitalizations')
    .select('client_id')
    .eq('id', hospitalizationId)
    .single();

  if (admissionError || !admission) {
    return NextResponse.json({ error: 'admission not found' }, { status: 404 });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert([{ client_id: admission.client_id, hospitalization_id: hospitalizationId }])
    .select()
    .single();

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }

  // Items are logged against a worksheet entry, not the admission
  // directly (see migration 019) — find every entry for this admission
  // first, then every item logged under any of them.
  const { data: noteRows } = await supabase
    .from('hospitalization_notes')
    .select('id')
    .eq('hospitalization_id', hospitalizationId);
  const noteIds = (noteRows || []).map((n) => n.id);

  const [{ data: treatmentItems }, { data: clinicSettings }] = await Promise.all([
    noteIds.length > 0
      ? supabase
          .from('treatment_items')
          .select('*, goods_services(id, name, base_price)')
          .in('hospitalization_note_id', noteIds)
      : Promise.resolve({ data: [] }),
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
