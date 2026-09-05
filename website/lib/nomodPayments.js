// website/lib/nomodPayments.js
// Shared "record a Nomod payment against its invoice" logic — used both
// by the webhook route (dormant/unverified — see lib/nomod.js) and by
// reconcilePendingNomodLink below, which the Settle Your Bill page
// triggers on every poll after a client returns from paying. Since
// Nomod may not push webhooks at all, actively re-checking a pending
// link's status via GET /v1/links/:id is the reliable path.

import { supabaseServer } from '@/lib/supabaseServer';
import { getPaymentLink, isPaidLinkStatus } from '@/lib/nomod';

// Looks up the most recent still-pending Nomod link for this invoice,
// asks Nomod for its current status, and — if it's now paid — logs the
// payment and recomputes the invoice's amount_paid/status. Safe to call
// repeatedly: a no-op once there's nothing pending, or once already
// recorded. Swallows Nomod API errors so a transient failure just means
// "try again on the next poll" rather than breaking the page.
export async function reconcilePendingNomodLink(invoiceId) {
  const { data: pending } = await supabaseServer
    .from('nomod_payment_links')
    .select('id, nomod_link_id, amount')
    .eq('invoice_id', invoiceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending?.nomod_link_id) return;

  let remoteLink;
  try {
    remoteLink = await getPaymentLink(pending.nomod_link_id);
  } catch {
    return;
  }

  if (!isPaidLinkStatus(remoteLink.status)) return;

  await recordNomodPayment(pending, invoiceId);
}

// `link` needs just { id, amount } — the nomod_payment_links row, however
// the caller found it (a status check here, or a webhook payload elsewhere).
export async function recordNomodPayment(link, invoiceId) {
  const now = new Date().toISOString();

  await supabaseServer.from('nomod_payment_links').update({ status: 'paid', paid_at: now }).eq('id', link.id);
  await supabaseServer
    .from('invoice_payments')
    .insert([{ invoice_id: invoiceId, amount: link.amount, payment_method: 'payment_link', paid_at: now }]);

  const { data: invoice } = await supabaseServer
    .from('invoices')
    .select('total, status')
    .eq('id', invoiceId)
    .single();
  const { data: payments } = await supabaseServer
    .from('invoice_payments')
    .select('amount, paid_at')
    .eq('invoice_id', invoiceId);

  if (invoice && invoice.status !== 'void') {
    const amountPaid = Math.round((payments || []).reduce((sum, p) => sum + Number(p.amount), 0) * 100) / 100;
    const update = { amount_paid: amountPaid };
    if (amountPaid <= 0) {
      update.status = 'unpaid';
      update.paid_at = null;
    } else if (amountPaid < Number(invoice.total)) {
      update.status = 'partially_paid';
      update.paid_at = null;
    } else {
      update.status = 'paid';
      update.paid_at = payments.reduce((latest, p) => (!latest || p.paid_at > latest ? p.paid_at : latest), null);
    }
    await supabaseServer.from('invoices').update(update).eq('id', invoiceId);
  }
}
