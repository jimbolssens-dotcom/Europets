// lib/administrationMethods.js
// Display labels for how a medication was actually given — dispensed to
// go home, or injected subcutaneously (SC) / intramuscularly (IM). This is
// the concrete per-administration value (treatment_items/invoice_line_items
// .administration_method); the fee for whichever one was used is applied
// automatically wherever it's added (see lib/invoicing.js).

export const ADMINISTRATION_METHOD_LABELS = {
  dispense: 'Dispensed',
  sc: 'Subcutaneous (SC)',
  im: 'Intramuscular (IM)',
};

// The catalog item's own classification (goods_services.administration_method,
// see migration 078) — "dispense" is fixed, "injectable" just means SC vs IM
// gets chosen each time it's actually administered rather than fixed here.
export const CATALOG_ADMINISTRATION_METHOD_LABELS = {
  dispense: 'Dispensed',
  injectable: 'Injectable (SC/IM chosen when given)',
};

// Resolves the concrete administration_method to store on a
// treatment_items/invoice_line_items/hospitalization_plan_items row, given
// the catalog item's own classification and (for an injectable item) the
// route the caller says was actually used. Returns { administration_method }
// or { error } — a dispensed item's method is fixed automatically; an
// injectable one requires the caller to have picked sc/im; anything else
// (not a medication) gets null.
export function resolveAdministrationMethod(catalogMethod, providedMethod) {
  if (catalogMethod === 'dispense') return { administration_method: 'dispense' };
  if (catalogMethod === 'injectable') {
    if (providedMethod !== 'sc' && providedMethod !== 'im') {
      return { error: 'administration_method must be "sc" or "im" for this injectable medication' };
    }
    return { administration_method: providedMethod };
  }
  return { administration_method: null };
}
