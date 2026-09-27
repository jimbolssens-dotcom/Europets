-- Migration 149: legacy payments
--
-- Until now, "recording" a client paying off their old-system balance
-- (see migration 069's clients.legacy_outstanding_balance) just quietly
-- decremented that one number — no record of when it happened, how much,
-- or who paid, and nothing counted it as real money received anywhere in
-- Accounting. This table gives each of those payments its own row, so
-- they show up in a proper log and can be folded into the P&L's cash-
-- basis revenue the same as any other payment collected.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists legacy_payments (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references clients(id) on delete cascade,
    amount numeric(10,2) not null check (amount > 0),
    paid_at timestamptz not null default now(),
    created_at timestamptz default now()
);

create index if not exists idx_legacy_payments_client on legacy_payments(client_id);
create index if not exists idx_legacy_payments_paid_at on legacy_payments(paid_at);

alter table legacy_payments disable row level security;

comment on table legacy_payments is
  'One row per payment a client makes against their legacy_outstanding_balance (migration 069) — real cash collected against an old-system debt, counted in Accounting''s P&L the same as any other payment.';
