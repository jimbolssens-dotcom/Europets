// website/lib/nomodPayments.js
// Shared "record a Nomod payment" logic — used both by the webhook route
// (dormant/unverified — see lib/nomod.js) and by reconcilePendingNomodLink
// / reconcilePendingNomodOwnerLink below, which the Settle Your Bill pages
// trigger on every poll after a client returns from paying. Since Nomod
// may not push webhooks at all, actively re-checking a pending link's
// status via GET /v1/links/:id is the reliable path.

import { supabaseServer } from '@/lib/supabaseServer';
import { supabaseServerAdmin } from '@/lib/supabaseServerAdmin';
import { getPaymentLink, isPaidLinkStatus, listLinkCharges, successfulChargeTotal } from '@/lib/nomod';

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

  const remoteLink = await fetchIfPaid(pending.nomod_link_id, pending.id);
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
    .is('pay_link_id', null) // a personal link's payments are recorded below, not spread here
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending?.nomod_link_id) return;

  const remoteLink = await fetchIfPaid(pending.nomod_link_id, pending.id);
  if (!remoteLink) return;

  await recordNomodOwnerPayment(pending, clientId);
}

// A client's personal payment link (lib/payLinks.js): checks the payments
// started through it in the last few days that Nomod hasn't confirmed to
// us yet, and logs each one that's now paid as an Online Payment for the
// client. Called by the pay page's polling, like the two above.
export async function reconcilePendingPayLinkPayments(payLink) {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pending } = await supabaseServerAdmin
    .from('nomod_payment_links')
    .select('id, nomod_link_id, amount, payer_name')
    .eq('pay_link_id', payLink.id)
    .eq('status', 'pending')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5);
  for (const row of pending || []) {
    if (!row.nomod_link_id) continue;
    const remoteLink = await fetchIfPaid(row.nomod_link_id, row.id);
    if (remoteLink) await recordPayLinkPayment(row, payLink);
  }
}

// Logs a paid personal-link payment as an Online Payment (donations, with
// its YY-MM-NN number) for the client. The link is claimed first (pending
// to paid), so two polls at once can't log it twice; the donation's link
// column is unique as a second guard. Applying it to invoices is the
// clinic app's job (its lib/clientCredit.js, every 10 minutes).
export async function recordPayLinkPayment(row, payLink) {
  const { data: claimed } = await supabaseServerAdmin
    .from('nomod_payment_links')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id');
  if (!claimed?.length) return;

  // The UAE date (UTC+4), for the received date and the month's number.
  const today = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const prefix = `${today.slice(2, 4)}-${today.slice(5, 7)}`;
  const { data: seq, error: seqError } = await supabaseServerAdmin.rpc('next_payment_sequence', { prefix });
  if (seqError) {
    // No number, no Online Payment: put the link back so the next check tries again.
    await supabaseServerAdmin.from('nomod_payment_links').update({ status: 'pending', paid_at: null }).eq('id', row.id);
    console.error('Pay-link payment: no payment number', row.id, seqError.message);
    return;
  }
  const pet = payLink.patients?.name;
  const { error } = await supabaseServerAdmin.from('donations').insert([
    {
      donation_number: `${prefix}-${String(seq).padStart(2, '0')}`,
      donor_name: row.payer_name || payLink.clients?.full_name || null,
      amount: row.amount,
      source: 'nomod',
      received_at: today,
      notes: `Personal payment link${pet ? ` (for ${pet})` : ''}`,
      client_id: payLink.client_id,
      nomod_payment_link_id: row.id,
    },
  ]);
  if (error) console.error('Pay-link payment received but not logged', row.id, error.message);
}

// Each check also stores Nomod's raw answer in nomod_link_checks
// (migration 176, staff-only): which status Nomod reports for a paid link
// was never confirmed, so this shows the real value. Only a check whose
// status changed since the last one is stored, so the page's polling
// doesn't fill the table.
// A link counts as paid once Nomod has a successful charge on it (the
// link's own status stays "enabled" after payment, see lib/nomod.js).
async function fetchIfPaid(nomodLinkId, paymentLinkId) {
  let remoteLink;
  let charges;
  try {
    remoteLink = await getPaymentLink(nomodLinkId);
    charges = await listLinkCharges(nomodLinkId);
  } catch (err) {
    await logCheck(paymentLinkId, nomodLinkId, { error: err.message });
    return null;
  }
  const paidTotal = successfulChargeTotal(charges.charges);
  const chargeStatuses = charges.charges.map((c) => c?.status).join(',');
  await logCheck(paymentLinkId, nomodLinkId, {
    remoteStatus: `link:${remoteLink?.status ?? ''} charges:${chargeStatuses || 'none'}`,
    payload: { link: remoteLink, charges: charges.raw },
  });
  if (paidTotal > 0 || isPaidLinkStatus(remoteLink.status)) return remoteLink;
  return null;
}

async function logCheck(paymentLinkId, nomodLinkId, { remoteStatus = null, payload = null, error = null }) {
  try {
    const { data: last } = await supabaseServerAdmin
      .from('nomod_link_checks')
      .select('remote_status, error')
      .eq('payment_link_id', paymentLinkId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && last.remote_status === remoteStatus && last.error === error) return;
    await supabaseServerAdmin.from('nomod_link_checks').insert([
      { payment_link_id: paymentLinkId, nomod_link_id: nomodLinkId, remote_status: remoteStatus, payload, error },
    ]);
  } catch {
    // Diagnostics only: never let logging break the payment page.
  }
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
  await supabaseServerAdmin
    .from('nomod_payment_links')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', linkId);
}

async function applyPaymentToInvoice(invoiceId, amount) {
  const now = new Date().toISOString();
  await supabaseServerAdmin
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
    await supabaseServerAdmin.from('invoices').update(update).eq('id', invoiceId);
  }
}
