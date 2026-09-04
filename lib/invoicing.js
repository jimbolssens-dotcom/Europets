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

// Turns a flat list of treatment_items (each already joined with its
// goods_services row) into invoice_line_items rows, consolidating the
// same medication logged across multiple worksheet entries — e.g. one
// hospitalization_notes row per day of a multi-day stay — into a single
// line with the quantities summed, instead of one line per day it was
// given. Used by the hospitalization worksheet's "Create Invoice" (see
// app/api/hospitalizations/[id]/invoice); a consult's treatment plan
// invoice doesn't need this since it's normally one row per medication
// already (see app/api/visits/[id]/invoice), so that route keeps calling
// applyAdministrationFee directly, one item at a time.
export function buildMedicationLineItems(treatmentItems, invoiceId, clinicSettings) {
  const itemsByGoodsService = new Map();
  for (const item of treatmentItems || []) {
    if (!item.goods_services) continue;
    const key = item.goods_services.id;
    if (!itemsByGoodsService.has(key)) itemsByGoodsService.set(key, []);
    itemsByGoodsService.get(key).push(item);
  }

  return Array.from(itemsByGoodsService.values()).map((group) => {
    const catalogItem = group[0].goods_services;
    const qty = group.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const unit_price = Number(catalogItem.base_price);
    // Different days can carry different instructions (a dosage change
    // partway through the stay) — keep every distinct one instead of
    // silently dropping any, rather than assuming they all match.
    const instructions = [...new Set(group.map((item) => item.instructions).filter(Boolean))];
    const description = instructions.length > 0 ? `${catalogItem.name} — ${instructions.join('; ')}` : catalogItem.name;

    const medicationLine = {
      invoice_id: invoiceId,
      goods_service_id: catalogItem.id,
      description,
      quantity: qty,
      unit_price,
      line_total: Math.round(unit_price * qty * 100) / 100,
      instructions: instructions.length > 0 ? instructions.join('; ') : null,
      administration_method: group[0].administration_method || null,
    };
    return applyAdministrationFee(medicationLine, group[0].administration_method, clinicSettings, group.length);
  });
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
