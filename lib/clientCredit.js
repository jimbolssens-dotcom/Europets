// lib/clientCredit.js
// Money paid through a client's personal payment link (migration 213,
// website/app/pay/[token]) arrives as an Online Payment (donations) with a
// client_id. This applies it to the client's unpaid invoices, oldest first,
// as ordinary invoice payments tagged with the Online Payment (so the
// Online Payments page shows where every dirham went), and keeps whatever
// is left as the client's credit until their next invoice. Run every 10
// minutes, before the thank-you messages (app/api/payments/thank-you-sweep).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { recomputeInvoicePayments } from '@/lib/invoicing';
import { allocatedByDonation, bookedAtFor } from '@/lib/donationAllocations';
import { planCreditApplication, creditPaidAt, isFreshPayment } from '@/lib/clientCreditPlan';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// The client's credit: what's left of their Online Payments with nothing
// to pay. clientIds -> { [clientId]: [{ donation_id, remaining, received_at, created_at }] }
async function creditsByClient(clientIds = null) {
  let query = supabaseAdmin.from('donations').select('id, client_id, amount, received_at, created_at').not('client_id', 'is', null).order('created_at');
  if (clientIds) query = query.in('client_id', clientIds);
  const { data: donations, error } = await query;
  if (error) return { error };
  const { data: allocated, error: allocError } = await allocatedByDonation((donations || []).map((d) => d.id));
  if (allocError) return { error: allocError };
  const out = {};
  for (const d of donations || []) {
    const remaining = round2(Number(d.amount) - (allocated[d.id] || 0));
    if (remaining <= 0.004) continue;
    (out[d.client_id] = out[d.client_id] || []).push({ donation_id: d.id, remaining, received_at: d.received_at, created_at: d.created_at });
  }
  return { data: out };
}

export async function clientCreditBalance(clientId) {
  const { data, error } = await creditsByClient([clientId]);
  if (error) return { error };
  return { credit: round2((data[clientId] || []).reduce((sum, c) => sum + c.remaining, 0)) };
}

// Applies every client's credit to their unpaid invoices. Returns
// { applied: [{ client_id, invoice_id, amount }], errors }.
export async function applyClientCredits({ clientIds = null, now = Date.now() } = {}) {
  const { data: credits, error } = await creditsByClient(clientIds);
  if (error) return { applied: [], errors: [error.message] };
  const applied = [];
  const errors = [];
  for (const [clientId, list] of Object.entries(credits)) {
    const { data: invoices, error: invError } = await supabaseAdmin
      .from('invoices')
      .select('id, total, amount_paid, created_at')
      .eq('client_id', clientId)
      .in('status', ['unpaid', 'partially_paid'])
      .order('created_at', { ascending: true });
    if (invError) {
      errors.push(invError.message);
      continue;
    }
    const plan = planCreditApplication(list, invoices || []);
    const byDonation = new Map(list.map((c) => [c.donation_id, c]));
    const byInvoice = new Map((invoices || []).map((i) => [i.id, i]));
    for (const step of plan) {
      const credit = byDonation.get(step.donation_id);
      const fresh = isFreshPayment(credit.created_at, now);
      const { error: insertError } = await supabaseAdmin.from('invoice_payments').insert([
        {
          invoice_id: step.invoice_id,
          amount: step.amount,
          // payment_link: the thank-you sweep and the books treat it like
          // any other online payment by card.
          payment_method: 'payment_link',
          donation_id: step.donation_id,
          paid_at: creditPaidAt(bookedAtFor(credit.received_at), byInvoice.get(step.invoice_id).created_at),
          // Credit from an earlier payment, now used: nothing to thank for.
          ...(fresh ? {} : { thank_you_sent_at: new Date(now).toISOString(), thank_you_error: 'credit used, not a new payment' }),
        },
      ]);
      if (insertError) {
        errors.push(insertError.message);
        continue;
      }
      await recomputeInvoicePayments(supabaseAdmin, step.invoice_id);
      applied.push({ client_id: clientId, invoice_id: step.invoice_id, amount: step.amount });
    }
  }
  return { applied, errors };
}
