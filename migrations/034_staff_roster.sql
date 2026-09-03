-- 034_staff_roster.sql
-- A real, date-based staff roster — "who's actually in on this specific
-- date, morning/afternoon" — distinct from staff_schedules (migration 028),
-- which is a recurring weekday template used only to warn when booking an
-- appointment outside a vet's usual hours. This table is what the new
-- Staff Roster admin page (week/month view, individual per-staff-per-day
-- toggles) and the mobile "My Schedule" self-service page read/write.
--
-- A staff member's presence for a given date+shift is represented purely
-- by row existence — add them in (insert) or take them off (delete) —
-- rather than a boolean flag, since that's exactly the "add or remove
-- themselves" action described for the mobile page.

create table if not exists staff_roster_entries (
    id uuid primary key default gen_random_uuid(),
    staff_id uuid references staff(id) on delete cascade not null,
    date date not null,
    shift text not null check (shift in ('morning', 'afternoon')),
    created_at timestamptz default now(),
    unique (staff_id, date, shift)
);

create index if not exists idx_staff_roster_entries_date on staff_roster_entries(date);
create index if not exists idx_staff_roster_entries_staff on staff_roster_entries(staff_id);

-- Supabase auto-enables RLS on new tables by default, which blocks all
-- access for the publishable/anon key until policies are added. This app
-- has no staff auth yet, so — like every other table — RLS is
-- intentionally off for now.
alter table staff_roster_entries disable row level security;

-- The admin Staff Roster page and the mobile "My Schedule" page both
-- subscribe to this table for live updates (another device adding/removing
-- a shift) — needs to be in the realtime publication for that to work.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_roster_entries'
  ) then
    alter publication supabase_realtime add table staff_roster_entries;
  end if;
end $$;
