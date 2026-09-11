// app/api/visits/[id]/invoice/route.js
// POST /api/visits/:id/invoice -> find-or-create the invoice for this
// consult, then sync it against every current treatment plan item — this
// consult's own, plus, if it led to a hospitalization, every medication
// logged on that stay's daily worksheet since (see
// lib/invoicing.js#gatherInvoiceTreatmentItems). Meant to be called every
// time the Invoice button is pressed, not just once: a hospitalized
// case's invoice keeps growing as more is logged, and this picks up
// whatever's new without touching lines already on the invoice — a
// manual edit, a removed line, or a recorded payment all survive (see
// syncInvoiceTreatmentItems). The invoice is also tagged with the
// hospitalization_id, when there's exactly one, so the hospitalization
// page's own Invoice button (app/api/hospitalizations/[id]/invoice)
// recognizes and syncs this same invoice instead of creating a second one.

import { supabase } from '@/lib/supabaseClient';
import { gatherInvoiceTreatmentItems, syncInvoiceTreatmentItems } from '@/lib/invoicing';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const visitId = params.id;

  const { data: linkedHospitalizations } = await supabase
    .from('hospitalizations')
    .select('id')
    .eq('originating_visit_id', visitId);
  const hospitalizationIds = (linkedHospitalizations || []).map((h) => h.id);

  const { data: existing } = await supabase
    .from('invoices')
    .select('id, hospitalization_id')
    .eq('visit_id', visitId)
    .neq('status', 'void')
    .limit(1)
    .maybeSingle();

  let invoiceId = existing?.id;

  if (!invoiceId) {
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('client_id')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({ error: 'consult not found' }, { status: 404 });
    }

    const invoiceInsert = { client_id: visit.client_id, visit_id: visitId };
    if (hospitalizationIds.length === 1) invoiceInsert.hospitalization_id = hospitalizationIds[0];

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert([invoiceInsert])
      .select()
      .single();

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }
    invoiceId = invoice.id;
  } else if (hospitalizationIds.length === 1 && existing.hospitalization_id !== hospitalizationIds[0]) {
    // The consult was invoiced before the hospitalization existed (or
    // before it was the only one) — link them now so the hospitalization
    // page's own Invoice button (which looks up by hospitalization_id)
    // finds this same invoice instead of creating a second one.
    await supabase.from('invoices').update({ hospitalization_id: hospitalizationIds[0] }).eq('id', invoiceId);
  }

  const treatmentItems = await gatherInvoiceTreatmentItems(supabase, { visitId, hospitalizationIds });
  const { error: syncError } = await syncInvoiceTreatmentItems(supabase, invoiceId, treatmentItems);
  if (syncError) {
    return NextResponse.json({ error: syncError.message }, { status: 500 });
  }

  return NextResponse.json({ id: invoiceId, existing: Boolean(existing) }, { status: existing ? 200 : 201 });
}
