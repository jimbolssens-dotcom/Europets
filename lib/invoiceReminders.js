// lib/invoiceReminders.js
// Automatic reminders for outstanding invoices, by WhatsApp and email both,
// run each morning by Vercel Cron (GET /api/invoices/send-due-reminders;
// three runs an hour apart, so a big batch that doesn't fit in one run's
// time limit finishes on the next):
//
//   stage 1, gentle:   the invoice is 2 weeks old
//   stage 2, second:   1 month old
//   stage 3, stronger: 2 months old (asks to settle within 7 days)
//
// Only unpaid / partially paid invoices with at least AED 50 still due, for
// clients who haven't been ticked "No payment reminders" on their page.
// An invoice gets the one stage its age has reached (an invoice first
// picked up at 5 weeks gets stage 2, not 1 then 2), and never two stages
// within 10 days of each other. A client with several invoices due gets one
// message covering them all, worded for the strongest stage among them.
//
// Every send is logged in invoice_reminders (migration 174), per invoice,
// stage and channel. A channel that failed (e.g. WhatsApp before Meta has
// approved the templates) is retried on the next runs for up to a week
// while the invoice is still at that stage; one that was sent never is.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPaymentReminder, isWhatsAppConfigured, submitMissingPaymentReminderTemplates } from '@/lib/metaWhatsapp';
import { sendFallbackEmail } from '@/lib/emailFallback';
import { balanceDue, invoiceLabel, money } from '@/lib/paymentReminders';

// One schedule, shared with the client page (lib/reminderStages.js).
import { REMINDER_STAGES, MIN_REMINDER_BALANCE, MIN_GAP_DAYS } from '@/lib/reminderStages';
export { REMINDER_STAGES, MIN_REMINDER_BALANCE };
const RETRY_DAYS = 7;
const DAY = 86400000;
const CHUNK = 150;

export function stageLabel(stage) {
  return REMINDER_STAGES.find((s) => s.stage === stage)?.label || `Stage ${stage}`;
}

export function targetStage(createdAt, now = new Date()) {
  const ageDays = (now.getTime() - new Date(createdAt).getTime()) / DAY;
  let target = 0;
  for (const s of REMINDER_STAGES) if (ageDays >= s.days) target = s.stage;
  return target;
}

export function websiteUrl() {
  return process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://epc.vet';
}

export function settleBillUrl(inv) {
  return `${websiteUrl()}/settle-bill/${inv.id}`;
}

function listWords(items) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function invoicesLabel(invoices) {
  // A long list reads badly in one WhatsApp line; the email lists each one.
  if (invoices.length > 4) return `${invoices.length} open invoices`;
  const labels = invoices.map(invoiceLabel);
  return `${invoices.length === 1 ? 'invoice' : 'invoices'} ${listWords(labels)}`;
}

// One invoice: its own Settle Your Bill page. Several: the website's
// pay-everything page for that owner (same as the client page's Pay All).
export function payUrlFor(invoices) {
  if (invoices.length === 1) return settleBillUrl(invoices[0]);
  return `${websiteUrl()}/settle-bill/owner/${invoices[0].client_id}`;
}

// Master switch: nothing is sent unless INVOICE_REMINDERS_ENABLED=true is
// set on the Vercel project (so the reminders can be paused without a code
// change, e.g. while the pay-online link is being checked).
export function invoiceRemindersEnabled() {
  return process.env.INVOICE_REMINDERS_ENABLED === 'true';
}

const EMAIL_SUBJECTS = {
  1: 'A gentle reminder about your Europets Clinic balance',
  2: 'Following up on your Europets Clinic balance',
  3: 'Your Europets Clinic balance is now overdue',
};

function emailText(stage, clientName, invoices) {
  const name = clientName || 'there';
  const total = `AED ${money(invoices.reduce((sum, inv) => sum + balanceDue(inv), 0))}`;
  const which = invoicesLabel(invoices);
  const lines = invoices.map((inv) => `${invoiceLabel(inv)}: AED ${money(balanceDue(inv))} due. Pay online: ${settleBillUrl(inv)}`).join('\n');
  const opening = {
    1: `We hope you and your pet are doing well! This is a gentle reminder from Europets Clinic that your balance for ${which}, a total of ${total}, is still open. Whenever it suits you, you can pay securely online using the link below.`,
    2: `We hope all is well with you and your pet. We wanted to follow up on your balance for ${which} at Europets Clinic, a total of ${total}, which has now been open for over a month. You can settle it online using the link below.`,
    3: `We are reaching out about your balance for ${which} at Europets Clinic, a total of ${total}, which is now more than two months overdue. We would be grateful if you could settle it within the next 7 days using the link below.`,
  }[stage];
  const closing = {
    1: 'If you have already paid, thank you so much, and please ignore this message.',
    2: 'We know life gets busy. If you have any questions about the bill, or if there is anything we can help with, just reply to this email.',
    3: 'We understand that things are not always easy. If a payment plan would help, simply reply to this email and we will gladly work something out with you.',
  }[stage];
  return `Hi ${name},\n\n${opening}\n\n${lines}\n\n${closing}\n\nWarm regards,\nThe Europets Clinic team`;
}

async function sentRemindersFor(invoiceIds) {
  const rows = [];
  for (let i = 0; i < invoiceIds.length; i += CHUNK) {
    const { data, error } = await supabaseAdmin
      .from('invoice_reminders')
      .select('invoice_id, stage, channel, sent_at')
      .eq('status', 'sent')
      .in('invoice_id', invoiceIds.slice(i, i + CHUNK));
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

// Works out what is due today: [{ client, channel, stage, invoices: [{ invoice, stage }] }].
export async function planDueInvoiceReminders(now = new Date()) {
  const cutoff = new Date(now.getTime() - REMINDER_STAGES[0].days * DAY).toISOString();
  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, total, amount_paid, status, created_at, client_id, clients(id, full_name, phone, email, payment_reminders_off)')
    .in('status', ['unpaid', 'partially_paid'])
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .range(0, 4999);
  if (error) throw error;

  const eligible = (invoices || []).filter(
    (inv) => inv.clients && !inv.clients.payment_reminders_off && balanceDue(inv) >= MIN_REMINDER_BALANCE
  );
  const sent = await sentRemindersFor(eligible.map((inv) => inv.id));
  const sentByInvoice = new Map();
  for (const r of sent) {
    if (!sentByInvoice.has(r.invoice_id)) sentByInvoice.set(r.invoice_id, []);
    sentByInvoice.get(r.invoice_id).push(r);
  }

  const groups = new Map(); // `${clientId}:${channel}` -> group
  for (const inv of eligible) {
    const stage = targetStage(inv.created_at, now);
    if (!stage) continue;
    const history = sentByInvoice.get(inv.id) || [];
    const maxSent = Math.max(0, ...history.map((r) => r.stage));
    const lastSent = Math.max(0, ...history.map((r) => new Date(r.sent_at).getTime()));
    const channels = [];
    if ((inv.clients.phone || '').replace(/\D/g, '')) channels.push('whatsapp');
    if (inv.clients.email) channels.push('email');
    for (const channel of channels) {
      if (history.some((r) => r.stage === stage && r.channel === channel)) continue;
      if (stage > maxSent) {
        // A new stage: not within 10 days of the previous reminder.
        if (lastSent && now.getTime() - lastSent < MIN_GAP_DAYS * DAY) continue;
      } else {
        // This stage already went out on the other channel: retry this
        // channel for a week, then let it go.
        const stageFirst = Math.min(...history.filter((r) => r.stage === stage).map((r) => new Date(r.sent_at).getTime()));
        if (now.getTime() - stageFirst > RETRY_DAYS * DAY) continue;
      }
      const key = `${inv.client_id}:${channel}`;
      if (!groups.has(key)) groups.set(key, { client: inv.clients, channel, invoices: [] });
      groups.get(key).invoices.push({ invoice: inv, stage });
    }
  }
  return [...groups.values()].map((g) => ({ ...g, stage: Math.max(...g.invoices.map((i) => i.stage)) }));
}

async function logRows(group, status, { error = null, waMessageId = null } = {}) {
  const rows = group.invoices.map(({ invoice, stage }) => ({
    invoice_id: invoice.id,
    client_id: group.client.id,
    stage,
    channel: group.channel,
    status,
    error,
    wa_message_id: waMessageId,
    amount_due: balanceDue(invoice),
  }));
  const { error: insertError } = await supabaseAdmin.from('invoice_reminders').insert(rows);
  if (insertError) console.error('invoice_reminders log failed', insertError.message);
}

export async function sendDueInvoiceReminders(now = new Date(), { budgetMs = 45000 } = {}) {
  const startedAt = Date.now();

  // Make sure Meta has the three templates (submits any that are missing).
  let templates = null;
  if (isWhatsAppConfigured() && process.env.META_WHATSAPP_WABA_ID) {
    try {
      templates = await submitMissingPaymentReminderTemplates();
    } catch (err) {
      templates = { error: err.message };
    }
  }

  // Templates are submitted even while paused, so Meta has approved them
  // by the time reminders are switched on.
  if (!invoiceRemindersEnabled()) {
    return { paused: true, reason: 'INVOICE_REMINDERS_ENABLED is not set to true', templates };
  }

  const plan = await planDueInvoiceReminders(now);
  const results = [];
  let deferred = 0;
  for (const group of plan) {
    // Stay inside the function time limit; whatever's left goes out on the
    // next scheduled run (the plan is recomputed from the log each time).
    if (Date.now() - startedAt > budgetMs) {
      deferred += 1;
      continue;
    }
    const invoices = group.invoices.map((i) => i.invoice);
    const clientName = group.client.full_name;
    const result = { client: clientName, channel: group.channel, stage: group.stage, invoices: invoices.map(invoiceLabel) };
    try {
      if (group.channel === 'whatsapp') {
        const digits = group.client.phone.replace(/\D/g, '');
        const total = `AED ${money(invoices.reduce((sum, inv) => sum + balanceDue(inv), 0))}`;
        const waMessageId = await sendPaymentReminder(digits, group.stage, {
          clientName,
          invoicesLabel: invoicesLabel(invoices),
          totalLabel: total,
          payUrl: payUrlFor(invoices),
        });
        await logRows(group, 'sent', { waMessageId });
        await supabaseAdmin.from('client_messages').insert([
          {
            client_id: group.client.id,
            phone: digits,
            channel: 'whatsapp',
            // 'system', not 'staff': see migration 163.
            sender: 'system',
            body: `${stageLabel(group.stage)} sent: ${invoicesLabel(invoices)}, ${total} outstanding`,
            wa_message_id: waMessageId,
            status: 'sent',
          },
        ]);
      } else {
        await sendFallbackEmail({
          clientId: group.client.id,
          to: group.client.email,
          subject: EMAIL_SUBJECTS[group.stage],
          text: emailText(group.stage, clientName, invoices),
        });
        await logRows(group, 'sent');
      }
      result.sent = true;
    } catch (err) {
      await logRows(group, 'failed', { error: err.message });
      result.sent = false;
      result.error = err.message;
    }
    results.push(result);
  }

  return {
    templates,
    messages: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent).length,
    deferred,
    results,
  };
}
