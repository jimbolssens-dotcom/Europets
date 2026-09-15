-- Migration 102: capture the supplier's own invoice/receipt number on an
-- expense — extracted automatically when a receipt is scanned (see
-- extractExpenseReceipt in lib/anthropicClient.js), editable by hand same
-- as every other scanned field. Unrelated to invoices.invoice_number,
-- which is this clinic's own sequential number on invoices it raises to
-- clients — this is the supplier's number on what the clinic bought.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table expenses add column if not exists invoice_number text;
