// lib/paymentSequence.js
// The shared sequence number Online Payments (donations.donation_number)
// and Old System Payments (legacy_payments.payment_number) now draw from
// together — see migration 156. Format is YY-MM-NN, resetting every
// month, identical to what donation_number always looked like; the only
// change is that the counter itself (payment_sequence_counters,
// next_payment_sequence()) is shared across both tables instead of each
// one scanning its own rows for the current max.

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// dateStr is a YYYY-MM-DD (or full ISO) string — the payment's own
// received/paid date, not necessarily today, since a backdated entry
// should get a number for the month it actually happened in.
export async function nextPaymentNumber(supabase, dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const prefix = `${yy}-${mm}`;

  const { data: seq, error } = await (supabase || supabaseAdmin).rpc('next_payment_sequence', { prefix });
  if (error) return { error };

  return { paymentNumber: `${prefix}-${String(seq).padStart(2, '0')}` };
}
