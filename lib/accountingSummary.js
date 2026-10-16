// lib/accountingSummary.js
// The monthly figures on the Accounting page, laid out the way the clinic
// has always done its books (the old "Float" spreadsheet):
//
//   Total takings     every payment received in the month, new invoices
//                     AND old-system (FileMaker) balances, by method:
//                     cash / card / online / bank transfer.
//   Total outgoing    day-to-day expenses, with and without VAT.
//   Gross profit      takings less those expenses.
//   Net profit        gross profit less the fixed monthly costs
//                     (salaries WPS/cash, sponsor, rent, utilities...).
//   VAT collected     the VAT inside what clients actually paid this month:
//                     for a new invoice, the payment's share of that
//                     invoice's own VAT (a few invoices carry none, so a
//                     flat 5/105 overstates it); for an old-system payment,
//                     5/105 of it, since every FileMaker invoice was charged
//                     VAT and it's paid over as the client pays.
//   VAT takings       the amount VAT applies to: VAT collected / 5%, the
//                     same reverse calculation as the spreadsheet.
//   VAT paid          VAT on expenses.
//   Net VAT due       VAT collected less VAT paid.
//
// Money figures (takings, outgoing, gross, net) are cash in and out,
// VAT included, as in the spreadsheet; the ex-VAT versions ride along.
// Pure, no database: app/api/accounting/summary does the fetching, and
// tests/accounting-summary.test.mjs checks the rules.

export const VAT_RATE = 0.05;

// Expense categories that are fixed monthly costs unless an expense says
// otherwise (expenses.fixed_cost, migration 199): staff can tick or untick
// it on any expense, so a one-off cost in one of these categories, or a
// fixed cost logged under "Other" (the sponsor fee), lands right.
export const FIXED_COST_CATEGORIES = new Set(['salaries', 'rent', 'utilities', 'professional_fees']);

export function isFixedCost(expense) {
  if (expense.fixed_cost === true || expense.fixed_cost === false) return expense.fixed_cost;
  return FIXED_COST_CATEGORIES.has(expense.category);
}

export const TAKINGS_METHODS = ['cash', 'card', 'online', 'bank_transfer', 'other'];

// invoice_payments.payment_method -> a takings column.
export function invoiceMethodGroup(method) {
  if (method === 'cash' || method === 'card' || method === 'bank_transfer') return method;
  if (method === 'payment_link' || method === 'nomod' || method === 'paymob' || method === 'paypal') return 'online';
  return 'other';
}

// legacy_payments.payment_method is a staff-managed display name
// (legacy_payment_methods, migration 155): "Cash", "Card", "Nomod"...
export function legacyMethodGroup(name) {
  const n = String(name || '').trim().toLowerCase();
  if (n === 'cash') return 'cash';
  if (n === 'card' || n === 'visa') return 'card';
  if (n === 'bank transfer' || n === 'transfer') return 'bank_transfer';
  if (n === 'nomod' || n === 'paypal' || n === 'paymob' || n === 'payment link' || n === 'online') return 'online';
  return 'other';
}

// The VAT inside one payment towards a new invoice: its share of that
// invoice's VAT. An invoice with no total (all discount) carries none.
export function invoicePaymentVat(amount, invoice) {
  const total = Number(invoice?.total || 0);
  if (total <= 0) return 0;
  return (Number(amount || 0) * Number(invoice?.vat_amount || 0)) / total;
}

// The VAT inside an old-system payment: VAT-inclusive at the standard rate.
export function legacyPaymentVat(amount) {
  return (Number(amount || 0) * VAT_RATE) / (1 + VAT_RATE);
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const sumBy = (rows, fn) => rows.reduce((t, r) => t + fn(r), 0);

// payments: invoice_payments rows with { amount, payment_method, invoices: { total, vat_amount } }
// legacyPayments: legacy_payments rows with { amount, payment_method }
// expenses: { amount, vat_amount, total, category, fixed_cost }
export function buildMonthlyFigures({ payments = [], legacyPayments = [], expenses = [] }) {
  const byMethod = Object.fromEntries(TAKINGS_METHODS.map((m) => [m, 0]));
  for (const p of payments) byMethod[invoiceMethodGroup(p.payment_method)] += Number(p.amount || 0);
  for (const p of legacyPayments) byMethod[legacyMethodGroup(p.payment_method)] += Number(p.amount || 0);

  const newInvoiceTakings = sumBy(payments, (p) => Number(p.amount || 0));
  const oldSystemTakings = sumBy(legacyPayments, (p) => Number(p.amount || 0));
  const takings = newInvoiceTakings + oldSystemTakings;

  const vatNewInvoices = sumBy(payments, (p) => invoicePaymentVat(p.amount, p.invoices));
  const vatOldSystem = sumBy(legacyPayments, (p) => legacyPaymentVat(p.amount));
  const vatCollected = vatNewInvoices + vatOldSystem;

  const dayToDay = expenses.filter((e) => !isFixedCost(e));
  const fixed = expenses.filter((e) => isFixedCost(e));
  const totalOf = (rows) => sumBy(rows, (e) => Number(e.total ?? Number(e.amount || 0) + Number(e.vat_amount || 0)));
  const exVatOf = (rows) => sumBy(rows, (e) => Number(e.amount || 0));
  const vatOf = (rows) => sumBy(rows, (e) => Number(e.vat_amount || 0));

  const outgoing = totalOf(dayToDay);
  const fixedCosts = totalOf(fixed);
  const vatPaid = vatOf(expenses);

  const gross = takings - outgoing;
  const grossExVat = takings - vatCollected - exVatOf(dayToDay);
  const net = gross - fixedCosts;
  const netExVat = grossExVat - exVatOf(fixed);

  return {
    takings: {
      total: round2(takings),
      ex_vat: round2(takings - vatCollected),
      new_invoices: round2(newInvoiceTakings),
      old_system: round2(oldSystemTakings),
      old_system_count: legacyPayments.length,
      by_method: Object.fromEntries(Object.entries(byMethod).map(([m, v]) => [m, round2(v)])),
    },
    outgoing: { total: round2(outgoing), ex_vat: round2(exVatOf(dayToDay)), vat: round2(vatOf(dayToDay)), count: dayToDay.length },
    fixed_costs: { total: round2(fixedCosts), ex_vat: round2(exVatOf(fixed)), count: fixed.length },
    gross_profit: { total: round2(gross), ex_vat: round2(grossExVat) },
    net_profit: { total: round2(net), ex_vat: round2(netExVat) },
    vat: {
      collected: round2(vatCollected),
      collected_new_invoices: round2(vatNewInvoices),
      collected_old_system: round2(vatOldSystem),
      takings: round2(vatCollected / VAT_RATE),
      paid: round2(vatPaid),
      net_due: round2(vatCollected - vatPaid),
    },
  };
}
