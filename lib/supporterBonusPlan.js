// lib/supporterBonusPlan.js
// A rescuer's supporter bonus (migration 215): what a gift through their
// payment link earns off their bills, and how a bonus becomes an invoice
// discount. Pure, so it can be tested (tests/supporter-bonus.test.mjs);
// lib/supporterBonus.js does the writing. The website shows the same
// tiers (website/lib/payLinkRules.js, bonusFor).

const cents = (n) => Math.round(Number(n || 0) * 100);

// The highest tier a single gift reaches: AED bonus off the bills (VAT
// included), or 0.
export function bonusFor(tiers, gift) {
  const best = [...(tiers || [])].filter((t) => Number(gift) >= Number(t.min)).sort((a, b) => b.min - a.min)[0];
  return best ? Number(best.bonus) : 0;
}

// Whether a gift received at `at` falls inside the promotion.
export function promotionCovers(promotion, at) {
  if (!promotion?.active) return false;
  const t = Date.parse(at);
  if (Date.parse(promotion.starts_at) > t) return false;
  return !promotion.ends_at || Date.parse(promotion.ends_at) >= t;
}

// An invoice discount is taken off the price before VAT (migration 123),
// so to take `billAmount` off what the client pays, the discount is that
// amount without its VAT.
export function discountForBillAmount(billAmount, vatRate = 0.05) {
  return Math.round((Number(billAmount) / (1 + vatRate)) * 100) / 100;
}
export function billAmountForDiscount(discount, vatRate = 0.05) {
  return Math.round(Number(discount) * (1 + vatRate) * 100) / 100;
}

// bonuses: [{ id, remaining }] oldest first; invoices: [{ id, total,
// amount_paid, subtotal, discount_amount }] oldest first. Returns [{
// bonus_id, invoice_id, bill_amount }]: what each bonus takes off each
// invoice, never more than the invoice still owes.
export function planBonusDiscounts(bonuses, invoices, vatRate = 0.05) {
  const left = bonuses.map((b) => ({ id: b.id, cents: cents(b.remaining) })).filter((b) => b.cents > 0);
  const out = [];
  for (const inv of invoices) {
    let room = Math.min(cents(inv.total) - cents(inv.amount_paid), cents(billAmountForDiscount(Number(inv.subtotal) - Number(inv.discount_amount || 0), vatRate)));
    for (const b of left) {
      if (room <= 0) break;
      if (b.cents <= 0) continue;
      const take = Math.min(room, b.cents);
      b.cents -= take;
      room -= take;
      out.push({ bonus_id: b.id, invoice_id: inv.id, bill_amount: take / 100 });
    }
  }
  return out;
}
