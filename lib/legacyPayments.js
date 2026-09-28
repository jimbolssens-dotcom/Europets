// lib/legacyPayments.js
// Shared between the "Record payment" form (app/(admin)/clients/[id]),
// its API route, and the accounting-wide log
// (app/(admin)/accounting/legacy-payments) so the same set of origins is
// offered, validated, and displayed everywhere a legacy payment shows up.
//
// The actual list of origins is staff-managed (migration 155,
// legacy_payment_methods table, via app/api/accounting/legacy-payment-methods)
// so someone can add "Nomod", "Tap", "PayPal", etc. themselves rather than
// asking for a code change every time a new origin comes up. This is only
// the seed/fallback list shown before that fetch completes.
//
// Deliberately a smaller starting set than invoice payments' own
// PAYMENT_METHOD_LABELS (app/_components/InvoicePaymentPanel.jsx) — a
// payment link/Nomod/PayMob/PayPal charge there is always a NEW-system
// invoice payment by definition, never something reconciled against the
// old system's carried-over balance.
export const DEFAULT_LEGACY_PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Other'];
