// lib/supporterBonus.js
// A rescuer's supporter bonus (migration 215, lib/supporterBonusPlan.js):
// each gift through their payment link earns a discount off their bills,
// by tier, and it's taken off their unpaid invoices automatically, before
// the gift itself is applied (lib/clientCredit.js), so they get the full
// value of both. A bonus with no bill to go on waits for the next invoice.
// Run every 10 minutes by app/api/payments/thank-you-sweep.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { recomputeInvoiceTotals } from '@/lib/invoicing';
import { bonusFor, promotionCovers, planBonusDiscounts, discountForBillAmount, billAmountForDiscount } from '@/lib/supporterBonusPlan';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export async function activePromotion(clientId) {
  const { data } = await supabaseAdmin.from('client_promotions').select('*').eq('client_id', clientId).eq('active', true).maybeSingle();
  return data || null;
}

// New gifts through the link earn their bonus. Returns how many.
async function earnBonuses(promotions) {
  let earned = 0;
  for (const promo of promotions) {
    const { data: gifts } = await supabaseAdmin
      .from('donations')
      .select('id, amount, created_at, donation_number')
      .eq('client_id', promo.client_id)
      .not('nomod_payment_link_id', 'is', null)
      .gte('created_at', promo.starts_at);
    if (!gifts?.length) continue;
    const { data: had } = await supabaseAdmin.from('promotion_bonuses').select('donation_id').in('donation_id', (gifts || []).map((g) => g.id));
    const done = new Set((had || []).map((h) => h.donation_id));
    for (const gift of gifts || []) {
      if (done.has(gift.id) || !promotionCovers(promo, gift.created_at)) continue;
      const amount = bonusFor(promo.tiers, gift.amount);
      if (amount <= 0) continue;
      const { error } = await supabaseAdmin
        .from('promotion_bonuses')
        .insert([{ promotion_id: promo.id, donation_id: gift.id, client_id: promo.client_id, gift_amount: gift.amount, amount }]);
      if (!error) earned++;
    }
  }
  return earned;
}

// Bonuses not yet used up go on the client's unpaid invoices.
async function applyBonuses(clientId) {
  const { data: bonuses } = await supabaseAdmin
    .from('promotion_bonuses')
    .select('id, amount, gift_amount, created_at, donations(donation_number)')
    .eq('client_id', clientId)
    .order('created_at');
  if (!bonuses?.length) return [];
  const { data: used } = await supabaseAdmin.from('invoice_discounts').select('promotion_bonus_id, amount').in('promotion_bonus_id', bonuses.map((b) => b.id));
  const usedBy = {};
  for (const u of used || []) usedBy[u.promotion_bonus_id] = round2((usedBy[u.promotion_bonus_id] || 0) + billAmountForDiscount(u.amount));
  const open = bonuses.map((b) => ({ ...b, remaining: round2(Number(b.amount) - (usedBy[b.id] || 0)) })).filter((b) => b.remaining > 0.004);
  if (!open.length) return [];

  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('id, total, amount_paid, subtotal, discount_amount')
    .eq('client_id', clientId)
    .in('status', ['unpaid', 'partially_paid'])
    .order('created_at', { ascending: true });
  const plan = planBonusDiscounts(open, invoices || []);
  const byId = new Map(open.map((b) => [b.id, b]));
  const applied = [];
  for (const step of plan) {
    const bonus = byId.get(step.bonus_id);
    const discount = discountForBillAmount(step.bill_amount);
    if (discount <= 0) continue;
    const { error } = await supabaseAdmin.from('invoice_discounts').insert([
      {
        invoice_id: step.invoice_id,
        amount: discount,
        reason: `Supporter bonus: AED ${Number(bonus.amount)} off for a gift of AED ${Number(bonus.gift_amount)}${bonus.donations?.donation_number ? ` (${bonus.donations.donation_number})` : ''}`,
        applied_by: null,
        promotion_bonus_id: bonus.id,
      },
    ]);
    if (error) continue;
    await recomputeInvoiceTotals(supabaseAdmin, step.invoice_id);
    applied.push({ invoice_id: step.invoice_id, bill_amount: step.bill_amount });
  }
  return applied;
}

export async function applySupporterBonuses() {
  const { data: promotions, error } = await supabaseAdmin.from('client_promotions').select('*').eq('active', true);
  if (error) return { error: error.message };
  const earned = await earnBonuses(promotions || []);
  const applied = [];
  for (const promo of promotions || []) applied.push(...(await applyBonuses(promo.client_id)));
  return { earned, applied };
}
