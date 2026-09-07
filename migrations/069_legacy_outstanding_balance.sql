-- Migration 069: legacy outstanding balance
--
-- Carries over each client's outstanding balance from the old clinic
-- software at import time, purely as a reference note -- it is not tied to
-- any invoice in this system (invoices started clean) and nothing here
-- updates it automatically. It's there so staff can see "this client owed
-- money in the old system" and go back to the old records to chase it up
-- or write it off, then clear it once settled.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table clients add column if not exists legacy_outstanding_balance numeric(10,2);

comment on column clients.legacy_outstanding_balance is
  'Outstanding balance carried over from the previous clinic software at import. Reference only -- not linked to any invoice here; clear it manually once reconciled or written off.';
