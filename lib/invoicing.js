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

// Takes a not-yet-inserted invoice_line_items row for a medication and,
// if it has an administration method with a nonzero configured fee, folds
// that fee into the line (description gets a short " (DIS)"/"(SC)"/"(IM)"
// tag, line_total gets the flat fee added on top — not multiplied by
// quantity, since the fee is per administration, not per unit of the
// medication). Returns the row unchanged if there's no method or the fee
// is AED 0.00 (nothing configured to charge).
export function applyAdministrationFee(lineItem, administrationMethod, clinicSettings) {
  const code = ADMINISTRATION_METHOD_CODES[administrationMethod];
  if (!code) return lineItem;

  const fee = Number(clinicSettings?.[ADMINISTRATION_FEE_COLUMNS[administrationMethod]] || 0);
  if (fee <= 0) return lineItem;

  return {
    ...lineItem,
    description: `${lineItem.description} (${code})`,
    line_total: Math.round((Number(lineItem.line_total) + fee) * 100) / 100,
  };
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
