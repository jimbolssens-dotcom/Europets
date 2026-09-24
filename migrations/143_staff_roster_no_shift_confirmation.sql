-- Migration 143: "no shifts this week" confirmation
--
-- MobileRosterGate.jsx blocks the mobile app until a staff member has
-- logged at least one shift for next week — but an empty roster can also
-- mean they genuinely have nothing on (approved leave, days off), not
-- just "hasn't logged it yet", and those two look identical from
-- staff_roster_entries alone. This table is the deliberate bypass: one
-- row means "staff_id confirmed they have no shifts for the week starting
-- week_start", which the gate treats the same as an actual logged shift
-- for clearing purposes.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists staff_roster_no_shift_confirmations (
    id uuid primary key default gen_random_uuid(),
    staff_id uuid references staff(id) on delete cascade not null,
    week_start date not null,
    created_at timestamptz default now(),
    unique (staff_id, week_start)
);

create index if not exists idx_staff_roster_no_shift_confirmations_staff on staff_roster_no_shift_confirmations(staff_id);

alter table staff_roster_no_shift_confirmations disable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_roster_no_shift_confirmations'
  ) then
    alter publication supabase_realtime add table staff_roster_no_shift_confirmations;
  end if;
end $$;
