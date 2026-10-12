-- Migration 177: thank-you WhatsApp after an online payment
--
-- When a client pays through the online pay link (invoice_payments with
-- payment_method 'payment_link', recorded by the website's Settle Your Bill
-- page), a sweep in the app (GET /api/payments/thank-you-sweep, every 10
-- minutes, see lib/paymentThankYou.js) sends them a thank-you from the
-- clinic's WhatsApp number, once.
--
-- thank_you_sent_at marks a payment as thanked (claimed before sending, so
-- two sweeps can never thank twice); thank_you_error keeps the last
-- failure (e.g. template not approved yet), retried for 3 days.
--
-- Safe to run more than once.

alter table invoice_payments
    add column if not exists thank_you_sent_at timestamptz,
    add column if not exists thank_you_error text;

create index if not exists invoice_payments_thank_you_pending_idx
    on invoice_payments (paid_at)
    where payment_method = 'payment_link' and thank_you_sent_at is null;
