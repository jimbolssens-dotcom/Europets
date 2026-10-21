-- 209_payment_method_correction.sql
-- A logged invoice payment's method can be corrected afterwards (a card
-- payment logged as cash, say), even once the invoice is paid
-- (PATCH /api/invoices/:id/payments/:paymentId). The method it was first
-- logged with and when it was changed are kept, so the correction shows on
-- the payment ("was Card") and the shift tally can be squared up.
-- Only the first correction's original is kept: later ones don't overwrite
-- what it was logged as. Safe to run more than once.

alter table invoice_payments add column if not exists method_corrected_from text;
alter table invoice_payments add column if not exists method_corrected_at timestamptz;
