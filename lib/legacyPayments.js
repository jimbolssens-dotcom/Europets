// lib/legacyPayments.js
// Shared between the "Record payment" form (app/(admin)/clients/[id]),
// its API route, and the accounting-wide log
// (app/(admin)/accounting/legacy-payments) so the same set of origins is
// offered, validated, and displayed everywhere a legacy payment shows up.
// Deliberately a smaller set than invoice payments' own PAYMENT_METHOD_LABELS
// (app/_components/InvoicePaymentPanel.jsx) — a payment link/Nomod/PayMob/
// PayPal charge is always a NEW-system invoice payment by definition, never
// something reconciled against the old system's carried-over balance.
export const LEGACY_PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  other: 'Other',
};
