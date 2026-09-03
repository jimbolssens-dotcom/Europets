// lib/administrationMethods.js
// Display labels for a medication's administration method (dispensed,
// given subcutaneously (SC), or given intramuscularly (IM)) — see
// goods_services.administration_method. The fee for whichever method a
// medication is configured with is applied automatically wherever it's
// added (see lib/invoicing.js); there's no per-booking selector, just
// this label used to show what was applied.

export const ADMINISTRATION_METHOD_LABELS = {
  dispense: 'Dispensed',
  sc: 'Subcutaneous (SC)',
  im: 'Intramuscular (IM)',
};
