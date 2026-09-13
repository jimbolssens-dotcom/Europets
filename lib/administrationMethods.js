// lib/administrationMethods.js
// Display labels for how a medication is given — dispensed to go home, or
// injected subcutaneously (SC) / intramuscularly (IM). A medication's
// catalog entry (goods_services.administration_method) now fixes exactly
// one of these ahead of time — see migration 095 — so every place it gets
// added just copies that fixed method onto the
// treatment_items/invoice_line_items row, with nothing to choose at the
// time it's actually given. The fee for whichever one is set is applied
// automatically wherever it's added (see lib/invoicing.js).

export const ADMINISTRATION_METHOD_LABELS = {
  dispense: 'Dispensed',
  sc: 'Subcutaneous (SC)',
  im: 'Intramuscular (IM)',
};

// Same labels, for the catalog item's own field (goods_services
// .administration_method) — identical values, kept as a separate export
// so catalog-editing UI doesn't have to reach into a "per administration"
// name to describe a catalog-level choice.
export const CATALOG_ADMINISTRATION_METHOD_LABELS = ADMINISTRATION_METHOD_LABELS;

// Resolves the concrete administration_method to store on a
// treatment_items/invoice_line_items/hospitalization_plan_items row, from
// the catalog item's own fixed classification — dispense/sc/im is copied
// straight across, anything else (not a medication) becomes null.
export function resolveAdministrationMethod(catalogMethod) {
  if (catalogMethod === 'dispense' || catalogMethod === 'sc' || catalogMethod === 'im') {
    return { administration_method: catalogMethod };
  }
  return { administration_method: null };
}
