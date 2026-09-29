-- Migration 156: shared payment sequence number across Online Payments
-- (donations) and Old System Payments (legacy_payments)
--
-- These stay two separate tables — a donation tracks invoice-apply/
-- allocation (migration 111) and a legacy payment knocks a client's
-- legacy_outstanding_balance directly (migration 069/149), logged from two
-- completely different pages — but from now on they share ONE running
-- sequence number, per calendar month (YY-MM-NN, same format donations
-- already used, resetting every month). So "payment #26-09-07" always
-- means exactly one specific real-world payment, whichever table it
-- actually lives in, instead of two different payments in two different
-- tabs coincidentally sharing a number.
--
-- Existing donation_number values are left exactly as they are — this
-- doesn't renumber anything already issued. The shared counter for each
-- month donations have already used is seeded to continue right after
-- whatever donation_number was highest that month, so the very next
-- payment logged (old-system or online) picks up from there without ever
-- reissuing a number. Existing legacy_payments rows are NOT backfilled
-- with a payment_number (same nullable-for-history precedent as
-- payment_method in migration 153) — only payments logged from here on
-- get one.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists payment_sequence_counters (
  month_prefix text primary key,
  next_seq integer not null default 1
);

alter table payment_sequence_counters disable row level security;

-- Atomically returns the next sequence number for a given "YY-MM" prefix
-- and advances the counter in the same statement — a single UPSERT ..
-- RETURNING, so an online payment and an old-system payment logged within
-- the same instant can never race into the same number the way
-- scan-for-the-max-then-insert-and-retry (donations' original approach)
-- could.
create or replace function next_payment_sequence(prefix text)
returns integer
language sql
as $$
  insert into payment_sequence_counters (month_prefix, next_seq)
  values (prefix, 2)
  on conflict (month_prefix)
  do update set next_seq = payment_sequence_counters.next_seq + 1
  returning next_seq - 1;
$$;

-- Seed every month donations have already used, so the shared counter
-- continues right after the highest donation_number already claimed that
-- month.
insert into payment_sequence_counters (month_prefix, next_seq)
select
  left(donation_number, 5) as month_prefix,
  max(split_part(donation_number, '-', 3)::integer) + 1 as next_seq
from donations
group by left(donation_number, 5)
on conflict (month_prefix) do update
  set next_seq = greatest(payment_sequence_counters.next_seq, excluded.next_seq);

alter table legacy_payments
  add column if not exists payment_number text;

create unique index if not exists idx_legacy_payments_payment_number
  on legacy_payments(payment_number) where payment_number is not null;
