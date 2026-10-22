// lib/payLinks.js
// A client's personal payment link (the clinic app's migration 213,
// client_payment_links): anyone with it pays any amount towards that
// client's account (app/pay/[token]). The payment is logged as an Online
// Payment for the client (lib/nomodPayments.js#recordPayLinkPayment); the
// clinic app then applies it to their unpaid invoices and keeps the rest as
// credit (its lib/clientCredit.js).

import { supabaseServerAdmin } from '@/lib/supabaseServerAdmin';

export { PAY_LINK_MIN, PAY_LINK_MAX, PAY_LINK_STARTS_PER_HOUR, payLinkAmountError } from '@/lib/payLinkRules';

// The live link for a token, with its client and pet, or null.
export async function loadPayLink(token) {
  if (!/^[A-Za-z0-9]{8,32}$/.test(token || '')) return null;
  const { data } = await supabaseServerAdmin
    .from('client_payment_links')
    .select('id, client_id, active, clients(id, full_name), patients(name)')
    .eq('token', token)
    .maybeSingle();
  return data?.active && data.clients ? data : null;
}

// What the client still owes on their invoices.
export async function balanceDue(clientId) {
  const { data: invoices } = await supabaseServerAdmin
    .from('invoices')
    .select('total, amount_paid')
    .eq('client_id', clientId)
    .in('status', ['unpaid', 'partially_paid']);
  return Math.round((invoices || []).reduce((sum, inv) => sum + Math.max(0, Number(inv.total) - Number(inv.amount_paid || 0)), 0) * 100) / 100;
}
