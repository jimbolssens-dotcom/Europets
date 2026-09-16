// lib/shiftSummary.js
// Shared "every payment logged in this half-day window" query + totals
// math, used by both the JSON API (app/api/shift-summary/route.js) and
// the printable PDF (app/api/shift-summary/pdf/route.js, lib/shiftTallyPdf.js)
// so the two never drift apart on what counts as "morning"/"afternoon" or
// how a total is rounded.
//
// "date"/"shift"/"cutoff" are all interpreted in UAE local time (UTC+4,
// no DST) regardless of what timezone the server process itself runs in —
// this matters here specifically (unlike the month-level summary) because
// a shift boundary is checked multiple times a day and a few hours' skew
// would put payments in the wrong half.
//
// cutoff (default 14:00) is the clinic's own midday changeover — not
// configured anywhere, just a per-lookup control on the page — so
// "morning" is [00:00, cutoff) and "afternoon" is [cutoff, 24:00) for
// that date.

import { splitVatInclusive } from '@/lib/invoicing';

export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'payment_link'];

function uaeIso(date, time) {
  return `${date}T${time}:00.000+04:00`;
}

export function validateShiftParams(date, shift, cutoff) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'date must be YYYY-MM-DD';
  if (shift !== 'morning' && shift !== 'afternoon') return 'shift must be "morning" or "afternoon"';
  if (!/^\d{2}:\d{2}$/.test(cutoff)) return 'cutoff must be HH:MM';
  return null;
}

export async function fetchShiftSummary(supabase, { date, shift, cutoff }) {
  const dayStart = new Date(uaeIso(date, '00:00'));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const cutoffAt = new Date(uaeIso(date, cutoff));

  const start = shift === 'morning' ? dayStart : cutoffAt;
  const end = shift === 'morning' ? cutoffAt : dayEnd;

  const { data: payments, error } = await supabase
    .from('invoice_payments')
    .select('*, staff(full_name), invoices(invoice_number, clients(full_name, client_number))')
    .gte('paid_at', start.toISOString())
    .lt('paid_at', end.toISOString())
    .order('paid_at', { ascending: true });

  if (error) return { error };

  const totalsByMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, { total: 0, count: 0 }]));
  let total = 0;
  for (const p of payments) {
    const amt = Number(p.amount || 0);
    total += amt;
    if (totalsByMethod[p.payment_method]) {
      totalsByMethod[p.payment_method].total += amt;
      totalsByMethod[p.payment_method].count += 1;
    }
  }

  // Each payment is collected VAT-inclusive (see invoices.amount_paid,
  // compared against invoices.total, itself VAT-inclusive) — split back
  // into its excl-VAT/VAT parts here so the payment log can show both
  // without every caller re-deriving it.
  const paymentsWithVat = payments.map((p) => ({ ...p, ...splitVatInclusive(p.amount) }));

  return {
    data: {
      date,
      shift,
      cutoff,
      window: { start: start.toISOString(), end: end.toISOString() },
      total: Math.round(total * 100) / 100,
      count: payments.length,
      totals_by_method: totalsByMethod,
      vat: splitVatInclusive(total),
      payments: paymentsWithVat,
    },
  };
}
