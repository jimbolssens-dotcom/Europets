// app/api/visits/[id]/invoice/route.js
// POST /api/visits/:id/invoice -> create an invoice for this consult and
// import every treatment plan item (catalog item + quantity, as entered
// during the consult) as a line item — a medication that was dispensed/
// SC/IM has its administration fee folded straight into that line (see
// lib/invoicing.js), not shown separately. If this consult led to a
// hospitalization (hospitalizations.originating_visit_id), every
// medication logged on that stay's daily worksheet (treatment_items off
// each hospitalization_notes entry — see app/api/hospitalizations/[id]/
// invoice) is pulled in too, so a consult that turned into an admission
// produces one invoice covering both instead of the hospital stay's
// medications being missed unless someone separately invoices the
// admission. Consolidated the same way as the hospitalization invoice:
// the same medication (consult and/or several hospitalization days)
// collapses into one line with quantities summed — see
// buildMedicationLineItems. If a non-void invoice already exists for
// this visit, that one is returned instead — no duplicates.

import { supabase } from '@/lib/supabaseClient';
import { recomputeInvoiceTotals, buildMedicationLineItems } from '@/lib/invoicing';
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

  const { data: linkedHospitalizations } = await supabase
    .from('hospitalizations')
    .select('id')
    .eq('originating_visit_id', visitId);
  const hospitalizationIds = (linkedHospitalizations || []).map((h) => h.id);

  // Tag the invoice with the hospitalization too, when there's exactly one
  // (the normal case) — so the hospitalization's own "Create Invoice"
  // button (app/api/hospitalizations/[id]/invoice) finds this same invoice
  // via its hospitalization_id check and returns it instead of creating a
  // second one that double-bills the same medications.
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

  let hospitalizationNoteIds = [];
  if (hospitalizationIds.length > 0) {
    const { data: noteRows } = await supabase
      .from('hospitalization_notes')
      .select('id')
      .in('hospitalization_id', hospitalizationIds);
    hospitalizationNoteIds = (noteRows || []).map((n) => n.id);
  }

  const [{ data: consultTreatmentItems }, { data: hospitalizationTreatmentItems }, { data: clinicSettings }] =
    await Promise.all([
      supabase.from('treatment_items').select('*, goods_services(id, name, base_price)').eq('visit_id', visitId),
      hospitalizationNoteIds.length > 0
        ? supabase
            .from('treatment_items')
            .select('*, goods_services(id, name, base_price)')
            .in('hospitalization_note_id', hospitalizationNoteIds)
        : Promise.resolve({ data: [] }),
      supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    ]);

  const treatmentItems = [...(consultTreatmentItems || []), ...(hospitalizationTreatmentItems || [])];
  const lineItems = buildMedicationLineItems(treatmentItems, invoice.id, clinicSettings);

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
