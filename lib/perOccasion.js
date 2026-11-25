// lib/perOccasion.js
// Items charged once per time given (goods_services.charge_per_occasion,
// migration 185: subcutaneous fluids, a force-feed) bill per SESSION,
// whatever amount was given. The worksheet already bills each entry once
// (lib/invoicing.js billedAmount); this guards the invoice itself, where
// staff type a quantity by hand and could enter the ml (180) and bill 180
// sessions. A quantity there must be a whole number of sessions.

export const MAX_SESSIONS_PER_LINE = 10;

// Returns an error message, or null when the quantity is fine.
export function perOccasionQuantityError(item, quantity) {
  if (!item?.charge_per_occasion) return null;
  const q = Number(quantity);
  if (Number.isInteger(q) && q >= 1 && q <= MAX_SESSIONS_PER_LINE) return null;
  const name = item.name || 'This item';
  return `${name} is charged once per session, whatever the amount given. Enter the number of sessions (usually 1), not the ml.`;
}
