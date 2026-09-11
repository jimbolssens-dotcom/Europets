// app/api/hospitalizations/[id]/invoice/route.js
// POST /api/hospitalizations/:id/invoice -> find-or-create the invoice
// for this admission, then sync it against every current treatment item
// logged on the daily worksheet, plus the originating consult's own
// treatment plan if there is one (see lib/invoicing.js#
// gatherInvoiceTreatmentItems) — the same source of truth the consult
// page's own Invoice button uses (app/api/visits/[id]/invoice), so
// whichever page it's opened from shows the same up-to-date invoice.
// Meant to be called every time the Invoice button is pressed, not just
// once — see syncInvoiceTreatmentItems for how a re-sync only adds
// what's new and leaves existing lines (manual edits, removed lines,
// recorded payments) untouched.

import { supabase } from '@/lib/supabaseClient';
import { gatherInvoiceTreatmentItems, syncInvoiceTreatmentItems } from '@/lib/invoicing';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const hospitalizationId = params.id;

  const { data: admission, error: admissionError } = await supabase
    .from('hospitalizations')
    .select('client_id, originating_visit_id')
    .eq('id', hospitalizationId)
    .single();

  if (admissionError || !admission) {
    return NextResponse.json({ error: 'admission not found' }, { status: 404 });
  }

  let { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('hospitalization_id', hospitalizationId)
    .neq('status', 'void')
    .limit(1)
    .maybeSingle();

  // Not found by hospitalization_id — but if the originating consult was
  // already invoiced before this admission existed (or before it was
  // linked), that invoice is still the right one to use. Adopt it instead
  // of creating a second invoice for the same medications.
  if (!existing && admission.originating_visit_id) {
    const { data: consultInvoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('visit_id', admission.originating_visit_id)
      .neq('status', 'void')
      .limit(1)
      .maybeSingle();
    if (consultInvoice) {
      await supabase.from('invoices').update({ hospitalization_id: hospitalizationId }).eq('id', consultInvoice.id);
      existing = consultInvoice;
    }
  }

  let invoiceId = existing?.id;

  if (!invoiceId) {
    const invoiceInsert = { client_id: admission.client_id, hospitalization_id: hospitalizationId };
    if (admission.originating_visit_id) invoiceInsert.visit_id = admission.originating_visit_id;

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert([invoiceInsert])
      .select()
      .single();

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }
    invoiceId = invoice.id;
  }

  const treatmentItems = await gatherInvoiceTreatmentItems(supabase, {
    visitId: admission.originating_visit_id,
    hospitalizationIds: [hospitalizationId],
  });
  const { error: syncError } = await syncInvoiceTreatmentItems(supabase, invoiceId, treatmentItems);
  if (syncError) {
    return NextResponse.json({ error: syncError.message }, { status: 500 });
  }

  return NextResponse.json({ id: invoiceId, existing: Boolean(existing) }, { status: existing ? 200 : 201 });
}
