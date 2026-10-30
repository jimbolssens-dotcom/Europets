// lib/paymentMessages.js
// Staff-triggered payment messages sent from the clinic's own WhatsApp
// Business number (Meta templates), instead of opening WhatsApp on the
// staff member's own phone or computer:
//
//   kind 'link':     "here is your link to settle..." (payment_link)
//   kind 'reminder': the gentle reminder (payment_reminder_gentle)
//
// for one invoice (invoiceId: link to its own Settle Your Bill page) or a
// client's whole open balance (clientId: link to the pay-all page). Logged
// in the client's chat thread. If Meta hasn't approved the template yet,
// the missing templates are submitted and { fallback: true } is returned,
// so the page can fall back to staff WhatsApp for now.
//
// For one invoice when the client has OTHER open invoices too, nothing is
// sent until the page says which it wants (scope 'all': one link for
// everything, or 'one': just this invoice): { choose: true, ... } comes
// back first. A link for one bill told a client with two open bills that
// a balance was left, with no way to pay it.
//
// The same message to the same client within 2 minutes is not sent again
// (a double tap sent the same link twice); it reports { alreadySent }.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  sendPaymentLinkMessage,
  sendPaymentReminder,
  paymentMessageTexts,
  isWhatsAppConfigured,
  submitMissingPaymentReminderTemplates,
} from '@/lib/metaWhatsapp';
import { balanceDue, invoiceLabel, money } from '@/lib/paymentReminders';
import { invoicesLabel, settleBillUrl, websiteUrl } from '@/lib/invoiceReminders';
import { petsLabelForInvoices } from '@/lib/petsLabelServer';

const RESEND_GUARD_MS = 2 * 60 * 1000;

async function openInvoicesFor(clientId) {
  const { data } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, total, amount_paid, status, client_id')
    .eq('client_id', clientId)
    .in('status', ['unpaid', 'partially_paid'])
    .order('created_at', { ascending: true });
  return (data || []).filter((inv) => balanceDue(inv) > 0);
}

export async function sendPaymentWhatsApp({ invoiceId, clientId, kind = 'link', scope = null }) {
  let invoices = [];
  let client = null;
  if (invoiceId) {
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, total, amount_paid, status, client_id, clients(id, full_name, phone)')
      .eq('id', invoiceId)
      .single();
    if (error || !data) return { ok: false, status: 404, error: 'invoice not found' };
    invoices = [data];
    client = data.clients;
    const others = (await openInvoicesFor(data.client_id)).filter((inv) => inv.id !== data.id);
    if (others.length > 0 && balanceDue(data) > 0 && data.status !== 'paid' && data.status !== 'void') {
      if (!scope) {
        const all = [data, ...others];
        return {
          ok: false,
          status: 409,
          choose: true,
          clientName: client?.full_name || null,
          thisInvoice: { label: invoiceLabel(data), due: `AED ${money(balanceDue(data))}` },
          others: others.map((inv) => ({ label: invoiceLabel(inv), due: `AED ${money(balanceDue(inv))}` })),
          allDue: `AED ${money(all.reduce((sum, inv) => sum + balanceDue(inv), 0))}`,
        };
      }
      if (scope === 'all') {
        invoiceId = null;
        clientId = data.client_id;
        invoices = [data, ...others];
      }
    }
  } else if (clientId) {
    const { data: c } = await supabaseAdmin.from('clients').select('id, full_name, phone').eq('id', clientId).single();
    if (!c) return { ok: false, status: 404, error: 'client not found' };
    client = c;
    invoices = await openInvoicesFor(clientId);
  } else {
    return { ok: false, status: 400, error: 'invoice_id or client_id is required' };
  }

  invoices = invoices.filter((inv) => inv.status !== 'void' && inv.status !== 'paid' && balanceDue(inv) > 0);
  if (invoices.length === 0) return { ok: false, status: 400, error: 'Nothing is outstanding to send a payment link for.' };

  const digits = (client?.phone || '').replace(/\D/g, '');
  if (digits.length <= 3) return { ok: false, status: 400, error: 'No phone number on file for this client.', noPhone: true };
  if (!isWhatsAppConfigured()) return { ok: false, status: 503, fallback: true, error: 'The clinic WhatsApp number is not set up.' };

  const payUrl = invoiceId ? settleBillUrl(invoices[0]) : `${websiteUrl()}/settle-bill/owner/${client.id}`;
  const totalLabel = `AED ${money(invoices.reduce((sum, inv) => sum + balanceDue(inv), 0))}`;
  const petsLabel = await petsLabelForInvoices(invoices.map((inv) => inv.id), client.id);
  const params = { clientName: client.full_name, petsLabel, invoicesLabel: invoicesLabel(invoices), totalLabel, payUrl };

  // Either wording it could have gone out in (naming the pet, or the one
  // before it while Meta hasn't approved that yet).
  const texts = paymentMessageTexts(kind === 'reminder' ? 'reminder1' : 'link', params);
  const { data: recent } = await supabaseAdmin
    .from('client_messages')
    .select('id')
    .eq('client_id', client.id)
    .in('body', texts)
    .gte('created_at', new Date(Date.now() - RESEND_GUARD_MS).toISOString())
    .limit(1);
  if (recent && recent.length > 0) {
    return { ok: true, alreadySent: true, invoices: invoices.map(invoiceLabel), total: totalLabel };
  }

  let waMessageId;
  // The full message as the client receives it, so the chat thread shows
  // what they actually read.
  let logBody;
  try {
    const sent = kind === 'reminder' ? await sendPaymentReminder(digits, 1, params) : await sendPaymentLinkMessage(digits, params);
    waMessageId = sent.id;
    logBody = sent.text;
  } catch (err) {
    if (err.templateUnavailable) {
      // Not approved yet (or never submitted): make sure Meta has it.
      try {
        await submitMissingPaymentReminderTemplates();
      } catch {}
      return { ok: false, status: 409, fallback: true, error: 'The clinic WhatsApp message is still waiting for Meta approval.' };
    }
    return { ok: false, status: 502, error: err.message };
  }

  await supabaseAdmin.from('client_messages').insert([
    {
      client_id: client.id,
      phone: digits,
      channel: 'whatsapp',
      // 'system', not 'staff': see migration 163.
      sender: 'system',
      body: logBody,
      wa_message_id: waMessageId,
      status: 'sent',
    },
  ]);
  return { ok: true, invoices: invoices.map(invoiceLabel), total: totalLabel };
}
