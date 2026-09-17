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
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { gatherInvoiceTreatmentItems, syncInvoiceTreatmentItems } from '@/lib/invoicing';
import { ensureHospitalizationCharges } from '@/lib/hospitalizationCharges';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const hospitalizationId = params.id;
  const body = await request.json().catch(() => ({}));
  const dogSize = body?.dog_size === 'small' || body?.dog_size === 'large' ? body.dog_size : undefined;

  const { data: admission, error: admissionError } = await supabase
    .from('hospitalizations')
    .select('client_id, originating_visit_id')
    .eq('id', hospitalizationId)
    .single();

  if (admissionError || !admission) {
    return NextResponse.json({ error: 'admission not found' }, { status: 404 });
  }

  // Backfill any missed day(s) of the automatic species/size hospitalization
  // charge before gathering treatment items, so it's always included in the
  // same sync rather than needing its own separate step. needsDogSize means
  // a dog's weight isn't on file yet — the charge is skipped (not guessed,
  // and everything else below still syncs normally) until the caller
  // re-POSTs with dog_size.
  const chargeResult = await ensureHospitalizationCharges(supabase, hospitalizationId, { dogSize });
  if (chargeResult.error) {
    return NextResponse.json({ error: chargeResult.error.message || String(chargeResult.error) }, { status: 500 });
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
      await supabaseAdmin.from('invoices').update({ hospitalization_id: hospitalizationId }).eq('id', consultInvoice.id);
      existing = consultInvoice;
    }
  }

  const treatmentItems = await gatherInvoiceTreatmentItems(supabase, {
    visitId: admission.originating_visit_id,
    hospitalizationIds: [hospitalizationId],
  });

  // Nothing billed yet and no invoice already exists for this case — don't
  // create an empty one just because this ran (the Pre-Invoice Overview
  // panel calls this on every page load, not just on a real click). An
  // invoice, even an empty one, blocks the case from being deleted, so a
  // case nobody has actually billed anything on yet should stay deletable.
  if (!existing && treatmentItems.length === 0) {
    return NextResponse.json({ id: null, existing: false, needs_dog_size: Boolean(chargeResult.needsDogSize) });
  }

  let invoiceId = existing?.id;

  if (!invoiceId) {
    const invoiceInsert = { client_id: admission.client_id, hospitalization_id: hospitalizationId };
    if (admission.originating_visit_id) invoiceInsert.visit_id = admission.originating_visit_id;

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert([invoiceInsert])
      .select()
      .single();

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }
    invoiceId = invoice.id;
  }

  const { error: syncError } = await syncInvoiceTreatmentItems(supabase, invoiceId, treatmentItems);
  if (syncError) {
    return NextResponse.json({ error: syncError.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: invoiceId, existing: Boolean(existing), needs_dog_size: Boolean(chargeResult.needsDogSize) },
    { status: existing ? 200 : 201 }
  );
}
