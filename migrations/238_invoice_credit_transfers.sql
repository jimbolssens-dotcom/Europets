-- Migration 238: carrying leftover credit to the client's next invoice
--
-- A deposit (app/api/invoices/[id]/payments, deposit: true) can leave an
-- invoice in credit once its case is over: the stay cost less than was
-- paid ahead. Jim: carry that over to the next invoice. It moves as a
-- credit transfer between the two invoices, not as a new payment, so the
-- money isn't counted twice in the takings (which read invoice_payments
-- only). An invoice's amount_paid = its payments + credit transferred in
-- - credit transferred out (lib/invoicing.js recomputeInvoicePayments).
--
--   invoice_payments.is_deposit   set on payments taken as a deposit; only
--                                 an invoice with one carries its credit
--                                 over on its own (lib/invoiceCreditCarry.js).
--                                 Other overpayments (often a payment
--                                 logged twice) wait for staff to press
--                                 "Move to next invoice".
--   invoice_credit_transfers      each move: from, to, amount, and who
--                                 ('Automatic' for the sweep).
--
-- Server-only (RLS on, no policy), read with the service role. Safe to
-- run more than once.

alter table invoice_payments add column if not exists is_deposit boolean not null default false;

-- Deposits taken since deposits went live (31 Oct) were tagged in their
-- note only.
update invoice_payments set is_deposit = true where note = 'Deposit' and is_deposit = false;

create table if not exists invoice_credit_transfers (
  id uuid primary key default gen_random_uuid(),
  from_invoice_id uuid not null references invoices(id) on delete cascade,
  to_invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  created_by text,
  created_at timestamptz not null default now(),
  check (from_invoice_id <> to_invoice_id)
);
create index if not exists invoice_credit_transfers_from on invoice_credit_transfers (from_invoice_id);
create index if not exists invoice_credit_transfers_to on invoice_credit_transfers (to_invoice_id);

alter table invoice_credit_transfers enable row level security;
