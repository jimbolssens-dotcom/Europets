-- Migration 183: two (or more) cats from one household in one bungalow
--
-- The clinic lets a second cat from the same household share a cattery
-- space. That's one booking (one space, one set of dates, one invoice and
-- consent), but each cat still has its own daily weight, food, litter and
-- comments. So:
--
--   cattery_booking_cats   the extra cats on a booking. The booking's own
--                          patient_id stays the first cat.
--   cattery_daily_logs.patient_id   which cat a day's row is for. Existing
--                          rows are filled in with their booking's cat, and
--                          a trigger fills it the same way for any row saved
--                          without one.
--
-- One row per cat per day: a new unique index on (booking_id, patient_id,
-- log_date). The old one-row-per-day constraint is dropped by migration
-- 184, once the code that saves per cat is live (the code running before
-- that still upserts on booking_id + log_date).
--
-- Safe to run more than once.

create table if not exists cattery_booking_cats (
    id uuid primary key default gen_random_uuid(),
    booking_id uuid references cattery_bookings(id) on delete cascade not null,
    patient_id uuid references patients(id) not null,
    created_at timestamptz default now(),
    unique (booking_id, patient_id)
);

alter table cattery_booking_cats enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cattery_booking_cats' and policyname = 'cattery_booking_cats_public_read'
  ) then
    execute 'create policy "cattery_booking_cats_public_read" on cattery_booking_cats for select using (true)';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cattery_booking_cats') then
    execute 'alter publication supabase_realtime add table cattery_booking_cats';
  end if;
end $$;

alter table cattery_daily_logs add column if not exists patient_id uuid references patients(id);

update cattery_daily_logs l
set patient_id = b.patient_id
from cattery_bookings b
where b.id = l.booking_id and l.patient_id is null;

create or replace function cattery_daily_logs_fill_patient() returns trigger
language plpgsql as $$
begin
  if new.patient_id is null then
    select patient_id into new.patient_id from cattery_bookings where id = new.booking_id;
  end if;
  return new;
end $$;

create or replace trigger cattery_daily_logs_fill_patient
  before insert or update on cattery_daily_logs
  for each row execute function cattery_daily_logs_fill_patient();

create unique index if not exists cattery_daily_logs_booking_patient_date_key
  on cattery_daily_logs (booking_id, patient_id, log_date);
