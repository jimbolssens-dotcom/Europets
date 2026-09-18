-- Migration 123: invoice discounts
--
-- A discount applied to an invoice at checkout — logged as its own
-- append-only entry (amount, optional reason, which staff member applied
-- it, when), mirroring invoice_payments' own log-not-a-mutable-field
-- shape, rather than a single editable number that would lose the trail
-- if changed. invoices.discount_amount is a stored summary column (sum
-- of this invoice's discount rows), kept in sync by
-- recomputeInvoiceTotals in lib/invoicing.js the same way
-- subtotal/vat_amount/total already are.
--
-- VAT is charged on the discounted amount, not the original price —
-- standard practice: recomputeInvoiceTotals now computes
-- vat_amount/total from (subtotal - discount_amount), floored at zero.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists invoice_discounts (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid references invoices(id) on delete cascade not null,
    amount numeric(10,2) not null check (amount > 0),
    reason text,
    applied_by uuid references staff(id),
    applied_at timestamptz not null default now(),
    created_at timestamptz default now()
);

create index if not exists idx_invoice_discounts_invoice on invoice_discounts(invoice_id);

alter table invoice_discounts disable row level security;

alter table invoices add column if not exists discount_amount numeric(10,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invoice_discounts'
  ) then
    execute 'alter publication supabase_realtime add table invoice_discounts';
  end if;
end $$;
