// lib/invoicing.js
// Shared invoice total math. UAE standard VAT = 5%, applied to the subtotal
// of all line items (each line already pre-VAT).

export const VAT_RATE = 0.05;

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
const ADMINISTRATION_METHOD_CODES = { dispense: 'DIS', sc: 'SC', im: 'IM' };

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
// represents — normally 1 (one treatment_items row -> one line), but the
// hospitalization worksheet's invoice consolidates the same medication
// logged across several days into a single line (see
// app/api/hospitalizations/[id]/invoice), so a 5-day course that was
// injected once a day still bills 5 administration fees, just folded into
// that one line instead of one line per day — the tag grows a "×N" so
// that's visible on the invoice rather than a silent lump sum.
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
// Shared by app/api/visits/[id]/invoice and app/api/hospitalizations/
// [id]/invoice so both stay behind the same source of truth regardless
// of which page the invoice is opened from.
export async function gatherInvoiceTreatmentItems(supabase, { visitId, hospitalizationIds = [] }) {
  const [{ data: consultItems }, hospItems] = await Promise.all([
    visitId
      ? supabase.from('treatment_items').select('*, goods_services(id, name, base_price)').eq('visit_id', visitId)
      : Promise.resolve({ data: [] }),
    (async () => {
      if (hospitalizationIds.length === 0) return [];
      const { data: noteRows } = await supabase
        .from('hospitalization_notes')
        .select('id')
        .in('hospitalization_id', hospitalizationIds);
      const noteIds = (noteRows || []).map((n) => n.id);
      if (noteIds.length === 0) return [];
      const { data } = await supabase
        .from('treatment_items')
        .select('*, goods_services(id, name, base_price)')
        .in('hospitalization_note_id', noteIds);
      return data || [];
    })(),
  ]);
  return [...(consultItems || []), ...hospItems];
}

// Builds one invoice_line_items row per treatment_items row that isn't
// on the invoice yet (alreadyInvoicedIds), tagged with
// source_treatment_item_id so a later sync can tell it's already been
// imported. Deliberately one line per item rather than consolidating
// same-medication rows into one (compare the old buildMedicationLineItems
// this replaced) — the invoice is meant to be revisited and kept in sync
// as a hospitalization progresses (see syncInvoiceTreatmentItems below),
// and a running list of what was added, and when, reads better for that
// than a single number that would need editing by hand on every re-sync.
function buildNewTreatmentItemLines(treatmentItems, invoiceId, clinicSettings, alreadyInvoicedIds) {
  return (treatmentItems || [])
    .filter((item) => item.goods_services && !alreadyInvoicedIds.has(item.id))
    .map((item) => {
      const catalogItem = item.goods_services;
      const qty = Number(item.quantity) || 1;
      const unit_price = Number(catalogItem.base_price);
      const line = {
        invoice_id: invoiceId,
        goods_service_id: catalogItem.id,
        source_treatment_item_id: item.id,
        description: item.instructions ? `${catalogItem.name} — ${item.instructions}` : catalogItem.name,
        quantity: qty,
        unit_price,
        line_total: Math.round(unit_price * qty * 100) / 100,
        instructions: item.instructions || null,
        administration_method: item.administration_method || null,
      };
      return applyAdministrationFee(line, item.administration_method, clinicSettings);
    });
}

// Adds a line item for every treatment_items row not already reflected
// on this invoice (tracked via invoice_line_items.source_treatment_item_id
// — see migration 087), leaving every existing line untouched: a manual
// edit, a removed line, or a recorded payment all survive a re-sync.
// Call this every time the invoice is (re)opened from the consult or
// hospitalization page, not just at creation — that's what makes it a
// living worksheet that keeps up with a hospitalized case as it
// progresses instead of a one-time snapshot.
export async function syncInvoiceTreatmentItems(supabase, invoiceId, treatmentItems) {
  const [{ data: clinicSettings }, { data: existingLines, error: existingError }] = await Promise.all([
    supabase.from('clinic_settings').select('*').eq('id', true).maybeSingle(),
    supabase.from('invoice_line_items').select('source_treatment_item_id').eq('invoice_id', invoiceId).not('source_treatment_item_id', 'is', null),
  ]);
  if (existingError) return { error: existingError };

  const alreadyInvoicedIds = new Set((existingLines || []).map((l) => l.source_treatment_item_id));
  const newLines = buildNewTreatmentItemLines(treatmentItems, invoiceId, clinicSettings, alreadyInvoicedIds);
  if (newLines.length === 0) return { addedCount: 0 };

  const { error: insertError } = await supabase.from('invoice_line_items').insert(newLines);
  if (insertError) return { error: insertError };

  const { error: totalsError } = await recomputeInvoiceTotals(supabase, invoiceId);
  if (totalsError) return { error: totalsError };

  return { addedCount: newLines.length };
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
    .select('total, status')
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

  const { data, error } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', invoiceId)
    .select()
    .single();

  return { data, error };
}

export async function recomputeInvoiceTotals(supabase, invoiceId) {
  const { data: items, error: itemsError } = await supabase
    .from('invoice_line_items')
    .select('line_total')
    .eq('invoice_id', invoiceId);

  if (itemsError) return { error: itemsError };

  const subtotal = (items || []).reduce((sum, item) => sum + Number(item.line_total), 0);
  const vat_amount = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = Math.round((subtotal + vat_amount) * 100) / 100;

  const { data, error } = await supabase
    .from('invoices')
    .update({ subtotal: Math.round(subtotal * 100) / 100, vat_amount, total })
    .eq('id', invoiceId)
    .select()
    .single();

  return { data, error };
}
