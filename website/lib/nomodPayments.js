// website/lib/nomodPayments.js
// Shared "record a Nomod payment" logic — used both by the webhook route
// (dormant/unverified — see lib/nomod.js) and by reconcilePendingNomodLink
// / reconcilePendingNomodOwnerLink below, which the Settle Your Bill pages
// trigger on every poll after a client returns from paying. Since Nomod
// may not push webhooks at all, actively re-checking a pending link's
// status via GET /v1/links/:id is the reliable path.

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

  const remoteLink = await fetchIfPaid(pending.nomod_link_id);
  if (!remoteLink) return;

  await recordNomodPayment(pending, invoiceId);
}

// Owner/"campaign" counterpart to reconcilePendingNomodLink — for a link
// created against a client's total outstanding balance (see
// website/app/api/settle-bill/owner/[clientId]) rather than one invoice.
export async function reconcilePendingNomodOwnerLink(clientId) {
  const { data: pending } = await supabaseServer
    .from('nomod_payment_links')
    .select('id, nomod_link_id, amount')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending?.nomod_link_id) return;

  const remoteLink = await fetchIfPaid(pending.nomod_link_id);
  if (!remoteLink) return;

  await recordNomodOwnerPayment(pending, clientId);
}

async function fetchIfPaid(nomodLinkId) {
  let remoteLink;
  try {
    remoteLink = await getPaymentLink(nomodLinkId);
  } catch {
    return null;
  }
  return isPaidLinkStatus(remoteLink.status) ? remoteLink : null;
}

// `link` needs just { id, amount } — the nomod_payment_links row, however
// the caller found it (a status check here, or a webhook payload elsewhere).
export async function recordNomodPayment(link, invoiceId) {
  await markLinkPaid(link.id);
  await applyPaymentToInvoice(invoiceId, link.amount);
}

// Applies a client-level Nomod payment across that client's outstanding
// invoices, oldest first — fully settling each in turn until the paid
// amount runs out (the last invoice it touches may only be partially
// covered). The link's amount was fixed to the client's total outstanding
// balance at creation time (see the owner settle-bill route), so a
// leftover only happens if invoices changed underneath it (staff added or
// voided one, or logged a manual payment) between link creation and
// payment — in that case whatever doesn't fit an outstanding invoice is
// left unapplied rather than guessed at; staff will see the mismatch on
// the client's financial overview.
export async function recordNomodOwnerPayment(link, clientId) {
  await markLinkPaid(link.id);

  const { data: invoices } = await supabaseServer
    .from('invoices')
    .select('id, total, amount_paid')
    .eq('client_id', clientId)
    .in('status', ['unpaid', 'partially_paid'])
    .order('created_at', { ascending: true });

  // Cents, not floats, so per-invoice rounding can't leave a stray 0.01
  // sitting unapplied at the end.
  let remainingCents = Math.round(Number(link.amount) * 100);
  for (const invoice of invoices || []) {
    if (remainingCents <= 0) break;
    const balanceDueCents = Math.round((Number(invoice.total) - Number(invoice.amount_paid || 0)) * 100);
    if (balanceDueCents <= 0) continue;
    const applyCents = Math.min(remainingCents, balanceDueCents);
    remainingCents -= applyCents;
    await applyPaymentToInvoice(invoice.id, applyCents / 100);
  }
}

async function markLinkPaid(linkId) {
  await supabaseServer
    .from('nomod_payment_links')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', linkId);
}

async function applyPaymentToInvoice(invoiceId, amount) {
  const now = new Date().toISOString();
  await supabaseServer
    .from('invoice_payments')
    .insert([{ invoice_id: invoiceId, amount, payment_method: 'payment_link', paid_at: now }]);

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
