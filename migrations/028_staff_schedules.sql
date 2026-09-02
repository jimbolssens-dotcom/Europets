-- Migration 028: weekly staff schedules — which mornings/afternoons each
-- staff member is expected to work. Used to warn (not block) when booking
-- a vet for an appointment outside their expected hours, with an override
-- for when a vet shows up unexpectedly. One row per staff member per
-- weekday+shift; a staff member with no rows at all has no schedule set
-- yet, so the appointment-booking check is simply skipped for them (never
-- warns until an admin actually configures a schedule).
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists staff_schedules (
    id uuid primary key default gen_random_uuid(),
    staff_id uuid references staff(id) on delete cascade not null,
    weekday smallint not null check (weekday between 0 and 6), -- 0=Sunday..6=Saturday, matches JS Date#getDay()
    shift text not null check (shift in ('morning', 'afternoon')),
    expected boolean not null default true,
    created_at timestamptz default now(),
    unique (staff_id, weekday, shift)
);

create index if not exists idx_staff_schedules_staff on staff_schedules(staff_id);

-- Supabase auto-enables RLS on new tables by default, which blocks all
-- access for the publishable/anon key until policies are added. This app
-- has no staff auth yet, so — like every other table (see
-- migrations/003_disable_rls.sql) — RLS is intentionally off for now.
alter table staff_schedules disable row level security;
