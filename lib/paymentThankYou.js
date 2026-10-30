// lib/paymentThankYou.js
// Thank-you WhatsApp, from the clinic's number, after a client pays online
// through the pay link (invoice_payments.payment_method = 'payment_link',
// recorded by the website's Settle Your Bill page). Run every 10 minutes
// by GET /api/payments/thank-you-sweep. Only online payments: someone
// paying at the desk is thanked in person.
//
// Each payment is claimed (thank_you_sent_at set) before sending, so it's
// thanked at most once (migration 177). A "pay everything" payment is
// split across several invoices; those rows are grouped per client so the
// client gets one message. If the send fails (e.g. Meta hasn't approved the
// template yet) the claim is released and retried, for up to 3 days.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPaymentThankYou, isWhatsAppConfigured } from '@/lib/metaWhatsapp';
import { petsLabelForInvoices } from '@/lib/petsLabelServer';
import { invoiceLabel, money, balanceDue } from '@/lib/paymentReminders';
import { invoicesLabel, payUrlFor } from '@/lib/invoiceReminders';

const RETRY_DAYS = 3;

export async function sendPaymentThankYous(now = new Date()) {
  if (!isWhatsAppConfigured()) return { skipped: 'WhatsApp is not configured' };
  const since = new Date(now.getTime() - RETRY_DAYS * 86400000).toISOString();
  const { data: payments, error } = await supabaseAdmin
    .from('invoice_payments')
    .select('id, amount, paid_at, invoice_id, invoices(id, invoice_number, total, amount_paid, status, client_id, clients(id, full_name, phone))')
    .eq('payment_method', 'payment_link')
    .is('thank_you_sent_at', null)
    .gte('paid_at', since)
    .order('paid_at', { ascending: true });
  if (error) throw error;

  const byClient = new Map();
  for (const p of payments || []) {
    const client = p.invoices?.clients;
    if (!client || Number(p.amount) <= 0) continue;
    if (!byClient.has(client.id)) byClient.set(client.id, { client, payments: [] });
    byClient.get(client.id).payments.push(p);
  }

  const results = [];
  for (const { client, payments: group } of byClient.values()) {
    const ids = group.map((p) => p.id);
    // Claim first: only the rows still unclaimed come back.
    const { data: claimed } = await supabaseAdmin
      .from('invoice_payments')
      .update({ thank_you_sent_at: new Date().toISOString(), thank_you_error: null })
      .in('id', ids)
      .is('thank_you_sent_at', null)
      .select('id');
    const claimedIds = new Set((claimed || []).map((c) => c.id));
    const mine = group.filter((p) => claimedIds.has(p.id));
    if (mine.length === 0) continue;

    const digits = (client.phone || '').replace(/\D/g, '');
    if (digits.length <= 3) {
      // Nothing to send to; leave it marked so it isn't retried forever.
      await supabaseAdmin.from('invoice_payments').update({ thank_you_error: 'no phone number on file' }).in('id', [...claimedIds]);
      results.push({ client: client.full_name, sent: false, reason: 'no phone' });
      continue;
    }

    const invoices = [...new Map(mine.map((p) => [p.invoices.id, p.invoices])).values()];
    const amountLabel = `AED ${money(mine.reduce((sum, p) => sum + Number(p.amount), 0))}`;
    const { data: open } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, total, amount_paid, client_id')
      .eq('client_id', client.id)
      .in('status', ['unpaid', 'partially_paid']);
    const stillOpen = (open || []).filter((inv) => balanceDue(inv) > 0.009);
    const remaining = stillOpen.reduce((sum, inv) => sum + balanceDue(inv), 0);
    // When something is still open, say which invoice(s) and give the link
    // to pay it: telling a client there's a balance without a way to pay
    // it left them stuck with a link for the invoice they'd just settled.
    const balanceLine = remaining > 0.009
      ? `A balance of AED ${money(remaining)} is still open for ${invoicesLabel(stillOpen)}. You can settle it securely here: ${payUrlFor(stillOpen)}`
      : 'Your account is now fully settled.';

    try {
      const thankYouParams = {
        clientName: client.full_name,
        petsLabel: await petsLabelForInvoices(invoices.map((inv) => inv.id), client.id),
        amountLabel,
        invoicesLabel: invoicesLabel(invoices),
        balanceLine,
      };
      const { id: waMessageId, text: sentText } = await sendPaymentThankYou(digits, thankYouParams);
      await supabaseAdmin.from('client_messages').insert([
        {
          client_id: client.id,
          phone: digits,
          channel: 'whatsapp',
          // 'system', not 'staff': see migration 163.
          sender: 'system',
          // The full message as the client reads it.
          body: sentText,
          wa_message_id: waMessageId,
          status: 'sent',
        },
      ]);
      results.push({ client: client.full_name, sent: true, amount: amountLabel });
    } catch (err) {
      // Release the claim so the next sweep retries (within RETRY_DAYS).
      await supabaseAdmin
        .from('invoice_payments')
        .update({ thank_you_sent_at: null, thank_you_error: err.message })
        .in('id', [...claimedIds]);
      results.push({ client: client.full_name, sent: false, reason: err.message });
    }
  }
  return { checked: (payments || []).length, messages: results.length, sent: results.filter((r) => r.sent).length, results };
}
