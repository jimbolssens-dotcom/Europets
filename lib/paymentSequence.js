// lib/paymentSequence.js
// Payment numbers, per calendar month, resetting every month:
//
//   Online Payments (donations.donation_number):        YY-MM-NN
//   Old System Payments (legacy_payments.payment_number): OS-YY-MM-NN
//
// Online Payments follow the clinic's own 2026 Master Transfers sheet
// (its "#" column), so the app's numbers match the sheet. Old System
// Payments have their own count with an OS in front, so the two never
// clash (migration 180; they shared one count before, migration 156).
// Each count lives in payment_sequence_counters, keyed by its prefix
// ("26-10" or "OS-26-10"), advanced atomically by next_payment_sequence().

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// dateStr is a YYYY-MM-DD (or full ISO) string — the payment's own
// received/paid date, not necessarily today, since a backdated entry
// should get a number for the month it actually happened in.
// kind: 'online' (Online Payments) or 'old_system' (Old System Payments).
export async function nextPaymentNumber(supabase, dateStr, kind = 'online') {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const prefix = `${kind === 'old_system' ? 'OS-' : ''}${yy}-${mm}`;

  const { data: seq, error } = await (supabase || supabaseAdmin).rpc('next_payment_sequence', { prefix });
  if (error) return { error };

  return { paymentNumber: `${prefix}-${String(seq).padStart(2, '0')}` };
}

// Corrections by hand (app/api/donations/[id]): keeps the counter in step so
// the next new payment doesn't skip a number or reuse one.

// A number now in use: the counter moves past it if it hasn't already.
export async function claimPaymentNumber(prefix, seq) {
  await supabaseAdmin.from('payment_sequence_counters').upsert({ month_prefix: prefix, next_seq: seq + 1 }, { onConflict: 'month_prefix', ignoreDuplicates: true });
  await supabaseAdmin.from('payment_sequence_counters').update({ next_seq: seq + 1 }).eq('month_prefix', prefix).lte('next_seq', seq);
}

// A number no longer in use (deleted, or changed to another): if it was the
// latest one given out that month, the counter steps back so the next new
// payment gets it, instead of leaving a gap. An older number stays a gap
// (it can be filled by changing a later payment's number to it).
export async function releasePaymentNumber(prefix, seq) {
  await supabaseAdmin.from('payment_sequence_counters').update({ next_seq: seq }).eq('month_prefix', prefix).eq('next_seq', seq + 1);
}
