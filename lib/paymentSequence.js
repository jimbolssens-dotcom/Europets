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
