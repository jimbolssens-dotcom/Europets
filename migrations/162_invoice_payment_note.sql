-- Migration 162: optional note on a logged payment
--
-- Lets staff jot a short reason/context alongside a partial payment (e.g.
-- "client paying the rest Friday", "deposit only, balance on discharge")
-- — previously there was nowhere on invoice_payments to record that at
-- all. See app/api/invoices/[id]/payments/route.js and
-- app/_components/InvoicePaymentPanel.jsx.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table invoice_payments add column if not exists note text;
