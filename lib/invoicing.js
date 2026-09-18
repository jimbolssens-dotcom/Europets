// lib/invoicing.js
// Shared invoice total math. UAE standard VAT = 5%, applied to the subtotal
// of all line items (each line already pre-VAT).

import { ADMINISTRATION_METHOD_CODES } from '@/lib/administrationMethods';
import { runConsultCompletionEffects } from '@/lib/consultCompletion';
import { runHospitalizationDischargeEffects } from '@/lib/hospitalizationDischarge';
import { ensureHospitalizationCharges, listHospitalizationRateCatalogItems } from '@/lib/hospitalizationCharges';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const VAT_RATE = 0.05;

// The inverse of the subtotal -> vat_amount -> total math above: given a
// VAT-inclusive (gross) amount — what a payment actually collects, per
// invoice_payments.amount — splits it back into its pre-VAT and VAT parts.
// Used by the shift tally, which reports what was physically collected
// per payment rather than per invoice line item.
export function splitVatInclusive(grossAmount) {
  const total = Math.round(Number(grossAmount || 0) * 100) / 100;
  const excl_vat = Math.round((total / (1 + VAT_RATE)) * 100) / 100;
  const vat_amount = Math.round((total - excl_vat) * 100) / 100;
  return { excl_vat, vat_amount, total };
}

// Medication administration methods (see migrations/032). A medication
// carries at most one method (goods_services.administration_method,
// copied onto a treatment_items row when it's added — see
// app/api/treatment-items/route.js); there's no per-booking choice, the
// fee is just applied automatically wherever the medication is added
// (treatment plan -> invoice conversion below, or straight onto an
// invoice via app/api/invoices/[id]/line-items). Deliberately folded
// into the medication's own line rather than shown as a separate one —
// a short code (DIS/SC/IM) tags the description and the fee is added
// straight into that line's total, so it doesn't read as its own
// itemized charge. Waiving it in the rare exceptional case means
// removing/adjusting that one line afterward. The fee amount is sourced
// from clinic_settings so there's one place to set/change it.

const ADMINISTRATION_FEE_COLUMNS = {
  dispense: 'dispensing_fee',
  sc: 'sc_injection_fee',
  im: 'im_injection_fee',
};

// Reverses the tag applyAdministrationFee appends (" (DIS)", " (SC ×3)",
// ...) — used when an already-invoiced line item's quantity or method is
// edited, so the fee gets recalculated from a clean description instead
// of stacking a second tag or leaving a stale one from the old method/count.
const FEE_TAG_PATTERN = / \((?:DIS|SC|IM)(?: ×\d+)?\)$/;
export function stripAdministrationFeeTag(description) {
  return (description || '').replace(FEE_TAG_PATTERN, '');
}

// Takes a not-yet-inserted invoice_line_items row for a medication and,
// if it has an administration method with a nonzero configured fee, folds
// that fee into the line (description gets a short " (DIS)"/"(SC)"/"(IM)"
// tag, line_total gets the flat fee added on top — not multiplied by
// quantity, since the fee is per administration, not per unit of the
// medication). Returns the row unchanged if there's no method or the fee
// is AED 0.00 (nothing configured to charge).
//
// `count` is how many separate administration events this one line
// represents — normally 1 (one treatment_items row -> one line), but a
// hospitalization worksheet item logged across several days consolidates
// onto a single line (see newConsolidatedLine/syncInvoiceTreatmentItems
// below), so a 5-day course that was injected once a day still bills 5
// administration fees, just folded into that one line instead of one line
// per day — the tag grows a "×N" so that's visible on the invoice rather
// than a silent lump sum.
//
// Dispensing is the one exception: it's a single hand-over of the
// medication supply, not a per-dose event, so it always bills once no
// matter how many days it was logged (a 5- or 10-day course of tablets
// still gets dispensed one time) — count only multiplies an actual
// administration fee (SC/IM).
export function applyAdministrationFee(lineItem, administrationMethod, clinicSettings, count = 1) {
  const code = ADMINISTRATION_METHOD_CODES[administrationMethod];
  if (!code) return lineItem;

  const feePerAdministration = Number(clinicSettings?.[ADMINISTRATION_FEE_COLUMNS[administrationMethod]] || 0);
  if (feePerAdministration <= 0) return lineItem;

  const effectiveCount = administrationMethod === 'dispense' ? 1 : count;
  const totalFee = feePerAdministration * effectiveCount;
  return {
    ...lineItem,
    description: `${lineItem.description} (${code}${effectiveCount > 1 ? ` ×${effectiveCount}` : ''})`,
    line_total: Math.round((Number(lineItem.line_total) + totalFee) * 100) / 100,
  };
}

// Pulls every treatment_items row that feeds a consult and/or
// hospitalization invoice — the consult's own treatment plan (visit_id)
// plus, for any hospitalization(s) it led to (or that hospitalization
// itself, invoked the other way round), everything logged on their daily
// worksheets (treatment_items off each hospitalization_notes entry).
// Shared by app/api/visits/[id]/invoice and syncHospitalizationInvoice so
// both stay behind the same source of truth regardless of which page the
// invoice is opened from.
//
// Each returned hospitalization-sourced item carries _sourceHospitalizationId
// (which of hospitalizationIds it actually came from) — irrelevant for a
// normal, single-record invoice, but what lets a merged invoice (see
// migration 114) tag each line with which case it belongs to.
export async function gatherInvoiceTreatmentItems(supabase, { visitId, hospitalizationIds = [] }) {
  const [{ data: consultItems }, hospItems] = await Promise.all([
    visitId
      ? supabase.from('treatment_items').select('*, goods_services(id, name, base_price)').eq('visit_id', visitId)
      : Promise.resolve({ data: [] }),
    (async () => {
      if (hospitalizationIds.length === 0) return [];
      const { data: noteRows } = await supabase
        .from('hospitalization_notes')
        .select('id, hospitalization_id')
        .in('hospitalization_id', hospitalizationIds);
      const noteIds = (noteRows || []).map((n) => n.id);
      if (noteIds.length === 0) return [];
      const hospitalizationIdByNoteId = new Map((noteRows || []).map((n) => [n.id, n.hospitalization_id]));
      const { data } = await supabase
        .from('treatment_items')
        .select('*, goods_services(id, name, base_price)')
        .in('hospitalization_note_id', noteIds);
      return (data || []).map((item) => ({
        ...item,
        _sourceHospitalizationId: hospitalizationIdByNoteId.get(item.hospitalization_note_id) || null,
      }));
    })(),
  ]);
  return [...(consultItems || []), ...hospItems];
}

// Describes the whole billing "family" a hospitalization belongs to for
// invoicing purposes: itself, unless it's been merged into another record
// (migration 114), in which case the PRIMARY is whichever record it's
// merged into, and every OTHER record also merged into that same primary
// rides along too — one hop only, matching the pattern used elsewhere in
// this app (vitals/report merging) for the same reason: simple to reason
// about, and always enough for the actual booking flows that produce these
// links.
export async function resolveInvoiceHospitalizationFamily(supabase, hospitalizationId) {
  const { data: requested } = await supabase
    .from('hospitalizations')
    .select('id, invoice_merged_with')
    .eq('id', hospitalizationId)
    .single();
  const primaryId = requested?.invoice_merged_with || hospitalizationId;

  const { data: members } = await supabase
    .from('hospitalizations')
    .select('id, kind, admitted_at, reason')
    .eq('invoice_merged_with', primaryId);

  const sectionLabelById = {};
  for (const member of members || []) {
    const kindLabel = member.kind === 'day_procedure' ? 'Day Procedure' : 'Hospitalization';
    const date = member.admitted_at ? new Date(member.admitted_at).toLocaleDateString() : '';
    sectionLabelById[member.id] = member.reason ? `${kindLabel} — ${date}: ${member.reason}` : `${kindLabel} — ${date}`;
  }

  return {
    primaryId,
    memberIds: [primaryId, ...(members || []).map((member) => member.id)],
    sectionLabelById, // no entry for primaryId — its own lines stay unlabeled
  };
}

// Find-or-adopt-or-create the invoice for a hospitalization's whole
// billing family (itself plus anything merged into it, see
// resolveInvoiceHospitalizationFamily) and sync it against every current
// treatment item across that family's worksheets, tagging merged-in
// records' lines with their own section_label. This is the shared
// implementation behind app/api/hospitalizations/[id]/invoice (called for
// a lone, unmerged hospitalization exactly as before) and the merge-invoice
// route (called on the target right after a merge, and again on every
// ordinary sync afterward since the target's family now includes the
// merged-in record).
export async function syncHospitalizationInvoice(supabase, hospitalizationId, { dogSize } = {}) {
  const { primaryId, memberIds, sectionLabelById } = await resolveInvoiceHospitalizationFamily(
    supabase,
    hospitalizationId
  );

  const { data: primary, error: primaryError } = await supabase
    .from('hospitalizations')
    .select('client_id, originating_visit_id')
    .eq('id', primaryId)
    .single();

  if (primaryError || !primary) {
    return { error: { message: 'admission not found' }, status: 404 };
  }

  const chargeResult = await ensureHospitalizationCharges(supabase, primaryId, { dogSize });
  if (chargeResult.error) {
    return { error: { message: chargeResult.error.message || String(chargeResult.error) }, status: 500 };
  }

  let { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('hospitalization_id', primaryId)
    .neq('status', 'void')
    .limit(1)
    .maybeSingle();

  // Not found by hospitalization_id — but if the originating consult was
  // already invoiced before this admission existed (or before it was
  // linked), that invoice is still the right one to use. Adopt it instead
  // of creating a second invoice for the same medications.
  if (!existing && primary.originating_visit_id) {
    const { data: consultInvoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('visit_id', primary.originating_visit_id)
      .neq('status', 'void')
      .limit(1)
      .maybeSingle();
    if (consultInvoice) {
      await supabaseAdmin.from('invoices').update({ hospitalization_id: primaryId }).eq('id', consultInvoice.id);
      existing = consultInvoice;
    }
  }

  const treatmentItems = await gatherInvoiceTreatmentItems(supabase, {
    visitId: primary.originating_visit_id,
    hospitalizationIds: memberIds,
  });

  // Nothing billed yet and no invoice already exists for this case — don't
  // create an empty one just because this ran (the Pre-Invoice Overview
  // panel calls this on every page load, not just on a real click). An
  // invoice, even an empty one, blocks the case from being deleted, so a
  // case nobody has actually billed anything on yet should stay deletable.
  if (!existing && treatmentItems.length === 0) {
    return { data: { id: null, existing: false, needs_dog_size: Boolean(chargeResult.needsDogSize) }, status: 200 };
  }

  let invoiceId = existing?.id;

  if (!invoiceId) {
    const invoiceInsert = { client_id: primary.client_id, hospitalization_id: primaryId };
    if (primary.originating_visit_id) invoiceInsert.visit_id = primary.originating_visit_id;

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert([invoiceInsert])
      .select()
      .single();

    if (invoiceError) {
      return { error: { message: invoiceError.message }, status: 500 };
    }
    invoiceId = invoice.id;
  }

  const { error: syncError } = await syncInvoiceTreatmentItems(supabase, invoiceId, treatmentItems, sectionLabelById);
  if (syncError) {
    return { error: { message: syncError.message }, status: 500 };
  }

  return {
    data: { id: invoiceId, existing: Boolean(existing), needs_dog_size: Boolean(chargeResult.needsDogSize) },
    status: existing ? 200 : 201,
  };
}

// A consult's one-off treatment plan item (visit_id set, no
// hospitalization_note_id) still gets its own line, same as always —
// tagged with source_treatment_item_ids: [item.id] so a later sync can
// tell it's already been imported (see migration 100). consolidation_key
// stays null: this line is never a target for a later quantity bump.
//
// sectionLabelById tags the line with which merged-in record it came from
// (see resolveInvoiceHospitalizationFamily) — null/undefined for an
// ordinary, non-merged invoice, which leaves section_label null exactly
// as before this parameter existed.
function oneOffLineFromTreatmentItem(item, invoiceId, clinicSettings, sectionLabelById = {}) {
  const catalogItem = item.goods_services;
  const qty = Number(item.quantity) || 1;
  const unit_price = Number(catalogItem.base_price);
  const line = {
    invoice_id: invoiceId,
    goods_service_id: catalogItem.id,
    source_treatment_item_ids: [item.id],
    consolidation_key: null,
    section_label: sectionLabelById[item._sourceHospitalizationId] || null,
    description: item.instructions ? `${catalogItem.name} — ${item.instructions}` : catalogItem.name,
    quantity: qty,
    unit_price,
    line_total: Math.round(unit_price * qty * 100) / 100,
    instructions: item.instructions || null,
    administration_method: item.administration_method || null,
  };
  return applyAdministrationFee(line, item.administration_method, clinicSettings);
}

// Groups a hospitalization worksheet's recurring items (same medication,
// same administration method, logged day after day) by what they'd
// consolidate onto: one invoice line per medication+method, not one per
// day it was given. Matches syncInvoiceTreatmentItems's own key so a line
// created here is found again on the next sync. Folds in
// _sourceHospitalizationId so a merged invoice keeps each record's
// recurring items on their own line instead of blending two cases'
// medication counts into one — harmless on a normal, non-merged invoice
// where every item shares the same source id anyway.
function consolidationKeyFor(item) {
  return `${item.goods_service_id}:${item.administration_method || 'none'}:${item._sourceHospitalizationId || 'self'}`;
}

// A brand-new consolidated line for a hospitalization worksheet item seen
// for the first time on this invoice — quantity is the number of times it
// was already logged by the time this sync ran, not always 1, so a
// medication given for several days before the invoice was first opened
// still lands as one line with the right count from the start. No
// instructions carried over (they can vary dose to dose; staff can type a
// line-level note directly on the invoice if needed).
function newConsolidatedLine(items, invoiceId, clinicSettings, sectionLabelById = {}) {
  const catalogItem = items[0].goods_services;
  const administrationMethod = items[0].administration_method || null;
  const quantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const unit_price = Number(catalogItem.base_price);
  const line = {
    invoice_id: invoiceId,
    goods_service_id: catalogItem.id,
    source_treatment_item_ids: items.map((item) => item.id),
    consolidation_key: consolidationKeyFor(items[0]),
    section_label: sectionLabelById[items[0]._sourceHospitalizationId] || null,
    description: catalogItem.name,
    quantity,
    unit_price,
    line_total: Math.round(unit_price * quantity * 100) / 100,
    instructions: null,
    administration_method: administrationMethod,
  };
  return applyAdministrationFee(line, administrationMethod, clinicSettings, quantity);
}

// Adds a line item for every treatment_items row not already reflected on
// this invoice (tracked via invoice_line_items.source_treatment_item_ids
// — see migration 100), leaving every existing line's own fields
// untouched beyond what a consolidation bump needs: a manual edit, a
// removed line, or a recorded payment all survive a re-sync. Call this
// every time the invoice is (re)opened from the consult or hospitalization
// page, not just at creation — that's what makes it a living worksheet
// that keeps up with a hospitalized case as it progresses instead of a
// one-time snapshot.
//
// A hospitalization worksheet item (hospitalization_note_id set) logged
// day after day consolidates onto one line with a running quantity —
// found again on each sync via consolidation_key — instead of a new line
// every single day. A consult's one-off treatment plan item still gets
// its own line each, same as before this changed (see
// oneOffLineFromTreatmentItem).
export async function syncInvoiceTreatmentItems(supabase, invoiceId, treatmentItems, sectionLabelById = {}) {
  const [{ data: clinicSettings }, { data: existingLines, error: existingError }] = await Promise.all([
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    supabase
      .from('invoice_line_items')
      .select('id, quantity, unit_price, description, consolidation_key, source_treatment_item_ids')
      .eq('invoice_id', invoiceId),
  ]);
  if (existingError) return { error: existingError };

  const alreadyInvoicedIds = new Set((existingLines || []).flatMap((l) => l.source_treatment_item_ids || []));
  const newItems = (treatmentItems || []).filter(
    (item) => item.goods_services && item.billable !== false && !alreadyInvoicedIds.has(item.id)
  );
  if (newItems.length === 0) return { addedCount: 0 };

  const recurring = newItems.filter((item) => item.hospitalization_note_id);
  const oneOff = newItems.filter((item) => !item.hospitalization_note_id);

  const groups = new Map();
  for (const item of recurring) {
    const key = consolidationKeyFor(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const newLines = oneOff.map((item) => oneOffLineFromTreatmentItem(item, invoiceId, clinicSettings, sectionLabelById));
  const lineUpdates = [];

  for (const [key, items] of groups) {
    const existingLine = (existingLines || []).find((l) => l.consolidation_key === key);
    if (!existingLine) {
      newLines.push(newConsolidatedLine(items, invoiceId, clinicSettings, sectionLabelById));
      continue;
    }
    const addedQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const newQuantity = Number(existingLine.quantity) + addedQty;
    const unit_price = Number(existingLine.unit_price);
    let line = {
      description: stripAdministrationFeeTag(existingLine.description),
      line_total: Math.round(unit_price * newQuantity * 100) / 100,
    };
    line = applyAdministrationFee(line, items[0].administration_method, clinicSettings, newQuantity);
    lineUpdates.push({
      id: existingLine.id,
      quantity: newQuantity,
      description: line.description,
      line_total: line.line_total,
      source_treatment_item_ids: [...(existingLine.source_treatment_item_ids || []), ...items.map((item) => item.id)],
    });
  }

  if (newLines.length > 0) {
    const { error: insertError } = await supabaseAdmin.from('invoice_line_items').insert(newLines);
    if (insertError) return { error: insertError };
  }
  for (const { id, ...fields } of lineUpdates) {
    const { error: updateError } = await supabaseAdmin.from('invoice_line_items').update(fields).eq('id', id);
    if (updateError) return { error: updateError };
  }
  if (newLines.length === 0 && lineUpdates.length === 0) return { addedCount: 0 };

  const { error: totalsError } = await recomputeInvoiceTotals(supabase, invoiceId);
  if (totalsError) return { error: totalsError };

  return { addedCount: newLines.length + lineUpdates.length };
}

// Sums invoice_payments for one invoice into invoices.amount_paid, and
// derives status from it: 0 paid -> unpaid, something but short of the
// total -> partially_paid, the full total or more -> paid (paid_at set to
// the latest payment's paid_at, for anything that still reads that
// column). A void invoice's status is left alone — payments shouldn't be
// getting logged against one, but this stays safe either way. Called
// after every insert/delete in app/api/invoices/[id]/payments/.
export async function recomputeInvoicePayments(supabase, invoiceId) {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('total, status, visit_id, hospitalization_id')
    .eq('id', invoiceId)
    .single();
  if (invoiceError) return { error: invoiceError };

  const { data: payments, error: paymentsError } = await supabase
    .from('invoice_payments')
    .select('amount, paid_at')
    .eq('invoice_id', invoiceId);
  if (paymentsError) return { error: paymentsError };

  const amount_paid =
    Math.round((payments || []).reduce((sum, p) => sum + Number(p.amount), 0) * 100) / 100;

  const wasFullyPaid = invoice.status === 'paid';
  const update = { amount_paid };
  if (invoice.status !== 'void') {
    if (amount_paid <= 0) {
      update.status = 'unpaid';
      update.paid_at = null;
    } else if (amount_paid < Number(invoice.total)) {
      update.status = 'partially_paid';
      update.paid_at = null;
    } else {
      update.status = 'paid';
      update.paid_at = payments.reduce(
        (latest, p) => (!latest || p.paid_at > latest ? p.paid_at : latest),
        null
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update(update)
    .eq('id', invoiceId)
    .select()
    .single();
  if (error) return { error };

  // An outstanding invoice being paid in full is what closes the record
  // it billed for — the same way staff would close it by hand — so a
  // paid invoice never leaves an active consult or an occupied cage
  // behind by oversight. Only fires on the transition into 'paid' (not
  // every recompute once it's already there), and never the other way
  // around: a payment later voided/removed that drops the invoice back
  // to partially_paid does not re-open whatever it closed — that's a
  // deliberate, separate staff decision, not something a payment edit
  // should trigger on its own.
  if (!wasFullyPaid && update.status === 'paid') {
    await closeLinkedRecordsOnFullPayment(supabase, invoice);
  }

  return { data, error };
}

async function closeLinkedRecordsOnFullPayment(supabase, invoice) {
  if (invoice.visit_id) {
    try {
      const { data: visit } = await supabase.from('visits').select('status').eq('id', invoice.visit_id).maybeSingle();
      if (visit && visit.status !== 'complete') {
        const { data: completedVisit, error } = await supabaseAdmin
          .from('visits')
          .update({ status: 'complete', ended_at: new Date().toISOString() })
          .eq('id', invoice.visit_id)
          .select()
          .single();
        if (error) throw error;
        await runConsultCompletionEffects(supabase, completedVisit);
      }
    } catch (err) {
      console.error('Failed to auto-complete consult after its invoice was paid in full', invoice.visit_id, err);
    }
  }

  if (invoice.hospitalization_id) {
    try {
      const { data: hospitalization } = await supabase
        .from('hospitalizations')
        .select('status')
        .eq('id', invoice.hospitalization_id)
        .maybeSingle();
      if (hospitalization && hospitalization.status !== 'discharged') {
        const { error } = await supabaseAdmin
          .from('hospitalizations')
          .update({ status: 'discharged', discharged_at: new Date().toISOString() })
          .eq('id', invoice.hospitalization_id);
        if (error) throw error;
        await runHospitalizationDischargeEffects(supabase, invoice.hospitalization_id);
      }
    } catch (err) {
      console.error('Failed to auto-discharge hospitalization after its invoice was paid in full', invoice.hospitalization_id, err);
    }

    // A merged-in record (see migration 114) has its own billing folded
    // into this invoice but is otherwise still its own case — paying this
    // invoice off in full closes it too, the same as the primary record,
    // since staff have no other invoice/payment flow left to close it from.
    try {
      const { data: mergedMembers } = await supabase
        .from('hospitalizations')
        .select('id, status')
        .eq('invoice_merged_with', invoice.hospitalization_id);
      for (const member of mergedMembers || []) {
        if (member.status === 'discharged') continue;
        const { error } = await supabaseAdmin
          .from('hospitalizations')
          .update({ status: 'discharged', discharged_at: new Date().toISOString() })
          .eq('id', member.id);
        if (error) throw error;
        await runHospitalizationDischargeEffects(supabase, member.id);
      }
    } catch (err) {
      console.error('Failed to auto-discharge merged-in hospitalization(s) after invoice was paid in full', invoice.hospitalization_id, err);
    }
  }
}

// A deliberate, explicit full re-categorization of a stay's ALREADY-CHARGED
// hospitalization-rate days — unlike the Pre-Invoice Overview panel's
// normal category dropdown (see hospitalization_rate_override_id,
// migration 117), which only ever affects days not yet charged, this
// actually repoints every existing charge (Cat/Dog S/M/Dog L, a prior
// override, ...) at the newly picked catalog item, for a case staff decide
// afterward should have been billed differently from the start (a rescue
// case correction on an older invoice, say). Deleting a hospitalization-
// rate line by hand doesn't work for this — the very next automatic sync
// just sees that day as unbilled again and recreates the charge — so this
// repoints the underlying treatment_items directly instead, which the sync
// then recognizes as already charged.
export async function replaceHospitalizationRateCharges(supabase, hospitalizationId, invoiceId, newGoodsServiceId) {
  const { data: rateCatalogItems, error: catalogError } = await listHospitalizationRateCatalogItems(supabase);
  if (catalogError) return { error: catalogError };
  const rateCatalogIds = (rateCatalogItems || []).map((c) => c.id);
  const newItem = (rateCatalogItems || []).find((c) => c.id === newGoodsServiceId);
  if (!newItem) return { error: new Error('That rate no longer exists in the catalog.') };

  const { data: noteRows, error: notesError } = await supabase
    .from('hospitalization_notes')
    .select('id')
    .eq('hospitalization_id', hospitalizationId);
  if (notesError) return { error: notesError };
  const noteIds = (noteRows || []).map((n) => n.id);
  if (noteIds.length === 0) return { changed: 0 };

  const { data: treatmentItemRows, error: itemsError } = await supabase
    .from('treatment_items')
    .select('id')
    .in('hospitalization_note_id', noteIds)
    .in('goods_service_id', rateCatalogIds);
  if (itemsError) return { error: itemsError };
  const treatmentItemIds = (treatmentItemRows || []).map((t) => t.id);
  if (treatmentItemIds.length === 0) return { changed: 0 };

  const { error: updateItemsError } = await supabaseAdmin
    .from('treatment_items')
    .update({ goods_service_id: newGoodsServiceId })
    .in('id', treatmentItemIds);
  if (updateItemsError) return { error: updateItemsError };

  // The invoice side may have more than one existing line feeding off these
  // treatment_items — e.g. exactly the double-charge the dropdown's earlier
  // bug could leave behind (see lib/hospitalizationCharges.js) — fold them
  // into one line under the new item and drop the rest, rather than leaving
  // stray duplicates now pointed at the same catalog item.
  const { data: invoiceLineRows, error: lineRowsError } = await supabase
    .from('invoice_line_items')
    .select('id, quantity, source_treatment_item_ids')
    .eq('invoice_id', invoiceId)
    .overlaps('source_treatment_item_ids', treatmentItemIds);
  if (lineRowsError) return { error: lineRowsError };
  if (!invoiceLineRows || invoiceLineRows.length === 0) return { changed: treatmentItemIds.length };

  const totalQuantity = invoiceLineRows.reduce((sum, l) => sum + Number(l.quantity), 0);
  const allSourceIds = [...new Set(invoiceLineRows.flatMap((l) => l.source_treatment_item_ids || []))];
  const unit_price = Number(newItem.base_price);
  const [keep, ...rest] = invoiceLineRows;

  const { error: keepError } = await supabaseAdmin
    .from('invoice_line_items')
    .update({
      goods_service_id: newGoodsServiceId,
      description: newItem.name,
      unit_price,
      quantity: totalQuantity,
      line_total: Math.round(unit_price * totalQuantity * 100) / 100,
      consolidation_key: `${newGoodsServiceId}:none:${hospitalizationId}`,
      source_treatment_item_ids: allSourceIds,
    })
    .eq('id', keep.id);
  if (keepError) return { error: keepError };

  if (rest.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('invoice_line_items')
      .delete()
      .in('id', rest.map((l) => l.id));
    if (deleteError) return { error: deleteError };
  }

  const { error: totalsError } = await recomputeInvoiceTotals(supabase, invoiceId);
  if (totalsError) return { error: totalsError };

  return { changed: treatmentItemIds.length };
}

export async function recomputeInvoiceTotals(supabase, invoiceId) {
  const [{ data: items, error: itemsError }, { data: discounts, error: discountsError }] = await Promise.all([
    supabase.from('invoice_line_items').select('line_total').eq('invoice_id', invoiceId),
    supabase.from('invoice_discounts').select('amount').eq('invoice_id', invoiceId),
  ]);

  if (itemsError) return { error: itemsError };
  // A missing/stale-schema-cache invoice_discounts table (e.g. its
  // migration hasn't been run yet) shouldn't be able to take down every
  // other invoice operation that ends by calling this function — treat it
  // as "no discounts yet" rather than failing the whole recompute (which
  // otherwise silently broke line-item consolidation and totals across
  // every invoice until the migration was applied — see incident notes
  // around 2026-09-18).
  if (discountsError && discountsError.code !== 'PGRST205') return { error: discountsError };
  if (discountsError) console.error('invoice_discounts unavailable, treating as no discounts:', discountsError.message);

  const subtotal = (items || []).reduce((sum, item) => sum + Number(item.line_total), 0);
  const discount_amount = discountsError ? 0 : (discounts || []).reduce((sum, discount) => sum + Number(discount.amount), 0);
  const taxableAmount = Math.max(0, subtotal - discount_amount);
  const vat_amount = Math.round(taxableAmount * VAT_RATE * 100) / 100;
  const total = Math.round((taxableAmount + vat_amount) * 100) / 100;

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({
      subtotal: Math.round(subtotal * 100) / 100,
      discount_amount: Math.round(discount_amount * 100) / 100,
      vat_amount,
      total,
    })
    .eq('id', invoiceId)
    .select()
    .single();

  return { data, error };
}
