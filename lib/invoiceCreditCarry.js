// lib/invoiceCreditCarry.js
// Leftover credit carried to the client's next invoice (migration 238).
// Jim: a deposit can leave an invoice in credit once the stay is over (it
// cost less than was paid ahead); carry that over to the next invoice.
//
// Credit on an invoice whose case is over (the consult completed, the stay
// discharged, or an invoice with no case) moves to the client's unpaid
// invoices, oldest first (planCreditApplication), as credit transfers, so
// the money isn't counted twice in the takings. Both invoices are then
// recomputed without closing anything: credit covering a new bill doesn't
// end that visit.
//
// Automatically (depositsOnly) only for invoices with a payment taken as a
// deposit: other overpayments are often a payment logged twice, and wait
// for staff to press "Move to next invoice" (depositsOnly false).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { recomputeInvoicePayments } from '@/lib/invoicing';
import { planCreditApplication } from '@/lib/clientCreditPlan';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// caseStatus: the consult's or stay's status (looked up separately: an
// embed through hospitalization_id off invoices fails, see
// app/api/invoices/[id]/route.js).
export function caseIsOver(invoice, caseStatus) {
  if (invoice.visit_id) return caseStatus === 'complete';
  if (invoice.hospitalization_id) return caseStatus === 'discharged';
  return true;
}

async function caseStatuses(invoices) {
  const visitIds = [...new Set(invoices.map((i) => i.visit_id).filter(Boolean))];
  const stayIds = [...new Set(invoices.map((i) => i.hospitalization_id).filter(Boolean))];
  const [{ data: visits }, { data: stays }] = await Promise.all([
    visitIds.length ? supabaseAdmin.from('visits').select('id, status').in('id', visitIds) : { data: [] },
    stayIds.length ? supabaseAdmin.from('hospitalizations').select('id, status').in('id', stayIds) : { data: [] },
  ]);
  const status = new Map([...(visits || []), ...(stays || [])].map((r) => [r.id, r.status]));
  return (inv) => status.get(inv.visit_id || inv.hospitalization_id) || null;
}

export function invoiceCredit(invoice) {
  return Math.max(0, round2(Number(invoice.amount_paid || 0) - Number(invoice.total || 0)));
}

// Moves credit. clientId: that client's credit; fromInvoiceId: just that
// invoice's (staff pressed the button: its case needn't be over). Returns
// { moved: [{ from, to, amount }], error }.
export async function carryOverCredit({ clientId = null, fromInvoiceId = null, depositsOnly = true, by = 'Automatic' } = {}) {
  let query = supabaseAdmin
    .from('invoices')
    .select('id, client_id, total, amount_paid, status, created_at, visit_id, hospitalization_id, invoice_payments(is_deposit)')
    .neq('status', 'void')
    .order('created_at');
  if (fromInvoiceId) query = query.eq('id', fromInvoiceId);
  else if (clientId) query = query.eq('client_id', clientId).eq('status', 'paid');
  else query = query.eq('status', 'paid');
  const { data: candidates, error } = await query;
  if (error) return { moved: [], error: error.message };

  const inCredit = (candidates || []).filter(
    (inv) => inv.client_id && invoiceCredit(inv) > 0.004 && (!depositsOnly || (inv.invoice_payments || []).some((p) => p.is_deposit))
  );
  const statusOf = fromInvoiceId ? () => null : await caseStatuses(inCredit);
  const sources = inCredit.filter((inv) => fromInvoiceId || caseIsOver(inv, statusOf(inv)));
  const moved = [];
  const byClient = new Map();
  for (const s of sources) {
    if (!byClient.has(s.client_id)) byClient.set(s.client_id, []);
    byClient.get(s.client_id).push(s);
  }
  for (const [client, list] of byClient) {
    const sourceIds = new Set(list.map((s) => s.id));
    const { data: owing, error: owingError } = await supabaseAdmin
      .from('invoices')
      .select('id, total, amount_paid, created_at')
      .eq('client_id', client)
      .in('status', ['unpaid', 'partially_paid'])
      .order('created_at');
    if (owingError) return { moved, error: owingError.message };
    const targets = (owing || []).filter((i) => !sourceIds.has(i.id));
    const plan = planCreditApplication(
      list.map((s) => ({ donation_id: s.id, remaining: invoiceCredit(s) })),
      targets
    );
    for (const step of plan) {
      const { error: insertError } = await supabaseAdmin
        .from('invoice_credit_transfers')
        .insert([{ from_invoice_id: step.donation_id, to_invoice_id: step.invoice_id, amount: step.amount, created_by: by }]);
      if (insertError) return { moved, error: insertError.message };
      await recomputeInvoicePayments(supabaseAdmin, step.donation_id, { autoClose: false });
      await recomputeInvoicePayments(supabaseAdmin, step.invoice_id, { autoClose: false });
      moved.push({ from: step.donation_id, to: step.invoice_id, amount: step.amount });
    }
  }
  return { moved };
}

// The credit moved in and out of one invoice, for its payment panel:
// [{ direction: 'in' | 'out', amount, invoice_number, created_at, created_by }].
export async function creditTransfersFor(invoiceId) {
  const { data, error } = await supabaseAdmin
    .from('invoice_credit_transfers')
    .select(
      'id, from_invoice_id, to_invoice_id, amount, created_at, created_by, from:invoices!invoice_credit_transfers_from_invoice_id_fkey(invoice_number, status), to:invoices!invoice_credit_transfers_to_invoice_id_fkey(invoice_number, status)'
    )
    .or(`from_invoice_id.eq.${invoiceId},to_invoice_id.eq.${invoiceId}`)
    .order('created_at');
  if (error) return [];
  return (data || [])
    .filter((t) => t.to?.status !== 'void')
    .map((t) => {
      const incoming = t.to_invoice_id === invoiceId;
      return {
        id: t.id,
        direction: incoming ? 'in' : 'out',
        amount: Number(t.amount),
        invoice_id: incoming ? t.from_invoice_id : t.to_invoice_id,
        invoice_number: incoming ? t.from?.invoice_number : t.to?.invoice_number,
        created_at: t.created_at,
        created_by: t.created_by,
      };
    });
}
