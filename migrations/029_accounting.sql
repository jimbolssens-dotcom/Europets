-- Migration 029: basic UAE VAT-compliant accounting — payment method on
-- invoices (so cash/card/bank/link receipts can be told apart) and a new
-- expenses table (so input VAT and a basic P&L can be computed alongside
-- the existing invoice/output-VAT numbers). Receipt photos for an expense
-- reuse the existing `attachments` table (entity_type = 'expense'),
-- exactly like every other photo/file attachment in the app — no separate
-- image column needed here.
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table invoices add column if not exists payment_method text
    check (payment_method in ('cash', 'card', 'bank_transfer', 'payment_link'));
alter table invoices add column if not exists paid_at timestamptz;

create table if not exists expenses (
    id uuid primary key default gen_random_uuid(),
    expense_date date not null default current_date,
    vendor_name text,
    description text,
    category text not null default 'other',  -- 'supplies', 'rent', 'utilities', 'salaries', 'equipment', 'marketing', 'professional_fees', 'other'
    amount numeric(10,2) not null,                 -- pre-VAT
    vat_amount numeric(10,2) not null default 0,   -- input VAT paid on this purchase (reclaimable)
    total numeric(10,2) not null,                  -- amount + vat_amount
    payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'payment_link')),
    created_at timestamptz default now()
);

create index if not exists idx_expenses_date on expenses(expense_date);

-- Supabase auto-enables RLS on new tables by default, which blocks all
-- access for the publishable/anon key until policies are added. This app
-- has no staff auth yet, so — like every other table (see
-- migrations/003_disable_rls.sql) — RLS is intentionally off for now.
alter table expenses disable row level security;

-- The accounting pages subscribe to live changes the same way invoices/
-- appointments/etc. already do. Guarded like migration 026, since ALTER
-- PUBLICATION ... ADD TABLE errors (rather than no-ops) if run twice.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    execute 'alter publication supabase_realtime add table expenses';
  end if;
end $$;
