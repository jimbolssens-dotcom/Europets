-- Migration 176: record what Nomod reports when a payment link is checked
--
-- The Settle Your Bill page asks Nomod for a pending link's status after the
-- client returns from paying, and only records the payment if that status
-- is a "paid" one (website/lib/nomod.js). Which word Nomod actually uses
-- for a paid link was never confirmed, and the first real test payment
-- (INV-602, AED 11.03, 12 Oct 2026) stayed pending, so each check now
-- stores Nomod's raw answer here to see the real status and payload.
--
-- Written by the website with the service role only; RLS on, no policies
-- (nothing public can read Nomod's payload). Safe to run more than once.

create table if not exists nomod_link_checks (
    id uuid primary key default gen_random_uuid(),
    payment_link_id uuid references nomod_payment_links(id) on delete cascade,
    nomod_link_id text,
    remote_status text,
    payload jsonb,
    error text,
    checked_at timestamptz not null default now()
);

create index if not exists nomod_link_checks_link_idx
    on nomod_link_checks (payment_link_id, checked_at);

alter table nomod_link_checks enable row level security;
