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
// invoice via app/api/invoices/[id]/line-items). Waiving it in the rare
// exceptional case is just removing that line from the invoice
// afterward. The fee amount is sourced from clinic_settings so there's
// one place to set/change it. goods_service_id is left null on these
// lines (they're a clinic fee, not a catalog product) — invoice pages
// already group line items with no linked catalog item under "Other"
// (see groupLineItemsByCategory).
export const ADMINISTRATION_FEE_LABELS = {
  dispense: 'Dispensing Fee',
  sc: 'Subcutaneous (SC) Injection Fee',
  im: 'Intramuscular (IM) Injection Fee',
};

const ADMINISTRATION_FEE_COLUMNS = {
  dispense: 'dispensing_fee',
  sc: 'sc_injection_fee',
  im: 'im_injection_fee',
};

// Returns an invoice_line_items row for a treatment item's administration
// fee, or null if it has no method set or the configured fee is zero (no
// point invoicing a AED 0.00 line).
export function administrationFeeLineItem(treatmentItem, clinicSettings, invoiceId) {
  const method = treatmentItem?.administration_method;
  const feeColumn = ADMINISTRATION_FEE_COLUMNS[method];
  if (!feeColumn) return null;

  const unitPrice = Number(clinicSettings?.[feeColumn] || 0);
  if (unitPrice <= 0) return null;

  return {
    invoice_id: invoiceId,
    goods_service_id: null,
    description: ADMINISTRATION_FEE_LABELS[method],
    quantity: 1,
    unit_price: unitPrice,
    line_total: unitPrice,
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
