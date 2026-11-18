// lib/noCharge.js
// A consult item ticked "free" (treatment_items.billable false) still shows
// on the bill, at 0.00 and marked "no charge" (Jim, 18 Nov), so the owner
// sees everything that was done. Used by the invoice sync (lib/invoicing.js)
// and the tax invoice PDF (lib/taxInvoicePdf.js). Pure.

export const NO_CHARGE_SUFFIX = ' — no charge';

// A consult's own item marked free. A hospital stay's unbilled items stay
// off the bill: those are charges the system itself took off (a discharge
// day, an oxygen night) or medicines already billed at the consult.
export function isNoChargeItem(item) {
  return item?.billable === false && !!item.visit_id && !item.hospitalization_note_id;
}

export function isNoChargeLine(line) {
  return String(line?.description || '').endsWith(NO_CHARGE_SUFFIX) && Number(line?.line_total) === 0;
}

// The invoice line for one: the catalog name (and instructions), 0.00.
export function noChargeLine(item, invoiceId, sectionLabel = null) {
  const name = item.goods_services?.name || 'Item';
  const qty = Number(item.quantity) || 1;
  return {
    invoice_id: invoiceId,
    goods_service_id: item.goods_services?.id || item.goods_service_id || null,
    source_treatment_item_ids: [item.id],
    consolidation_key: null,
    section_label: sectionLabel,
    description: `${item.instructions ? `${name} — ${item.instructions}` : name}${NO_CHARGE_SUFFIX}`,
    quantity: qty,
    times_given: 1,
    unit_price: 0,
    line_total: 0,
    instructions: item.instructions || null,
    administration_method: item.administration_method || null,
  };
}
