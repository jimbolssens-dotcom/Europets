// lib/donationAllocations.js
// How much of each online payment (donations, migration 111, shown as
// Accounting > Online Payments) has been applied, and where: to new
// invoices (invoice_payments.donation_id) and, since migration 199, to
// clients' old-system balances (legacy_payments.donation_id). Every
// "remaining" check goes through here so neither kind can be missed.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { selectAll } from '@/lib/selectAll';

// Online payment source -> old-system payment origin (legacy_payment_methods).
export const LEGACY_METHOD_FOR_SOURCE = {
  nomod: 'Nomod',
  paymob: 'Paymob',
  paypal: 'PayPal',
  bank_transfer: 'Bank Transfer',
};

// The date an online payment was received, as the moment its money is
// booked (invoice_payments.paid_at / legacy_payments.paid_at): midday in
// Dubai, so it lands in the right day and month in the books, rather than
// the day someone got round to applying it.
export function bookedAtFor(receivedAt) {
  return /^\d{4}-\d{2}-\d{2}$/.test(receivedAt || '') ? `${receivedAt}T08:00:00.000Z` : undefined;
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// donationIds -> { [id]: allocated amount }
export async function allocatedByDonation(donationIds) {
  const result = {};
  if (!donationIds.length) return { data: result };
  const [invoiceRes, legacyRes] = await Promise.all([
    selectAll(() => supabaseAdmin.from('invoice_payments').select('id, donation_id, amount').in('donation_id', donationIds).order('id')),
    selectAll(() => supabaseAdmin.from('legacy_payments').select('id, donation_id, amount').in('donation_id', donationIds).order('id')),
  ]);
  const error = invoiceRes.error || legacyRes.error;
  if (error) return { error };
  for (const row of [...(invoiceRes.data || []), ...(legacyRes.data || [])]) {
    result[row.donation_id] = round2((result[row.donation_id] || 0) + Number(row.amount));
  }
  return { data: result };
}
