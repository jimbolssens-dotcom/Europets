-- Migration 167: cattery bookings and their daily care sheet
--
-- The clinic has 7 cattery spaces for boarding cats. Each booking puts
-- one patient in one space for a date range (date_in to date_out, both
-- inclusive), and records whether the cat got its deworming and external
-- parasite treatment on arrival (with the product used, e.g. Dewormin /
-- Fiprotec).
--
-- cattery_daily_logs is the digital version of the paper sheet clipped to
-- the cage: one row per booking per day, with that day's weight, whether
-- it ate its AM/PM food, the litter tray, a staff check tick and a
-- comment. A checked-in booking with no weight recorded for today by
-- 18:00 Dubai time raises the Cattery alarm (see lib/catteryAttention.js).
--
-- Reads happen through the anon client (public-read policy, same as
-- other clinical tables); every write goes through app/api/cattery/*
-- with supabaseAdmin.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists cattery_bookings (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id) not null,
    client_id uuid references clients(id),
    space_number int not null check (space_number between 1 and 7),
    date_in date not null,
    date_out date not null,
    status text not null default 'booked'
        check (status in ('booked', 'checked_in', 'checked_out', 'cancelled')),
    deworming_done boolean not null default false,
    deworming_product text,
    external_parasite_done boolean not null default false,
    external_parasite_product text,
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    check (date_out >= date_in)
);

create index if not exists cattery_bookings_dates_idx on cattery_bookings (date_in, date_out);
create index if not exists cattery_bookings_patient_idx on cattery_bookings (patient_id);

create table if not exists cattery_daily_logs (
    id uuid primary key default gen_random_uuid(),
    booking_id uuid references cattery_bookings(id) on delete cascade not null,
    log_date date not null,
    weight_kg numeric(5,2),
    food_am text,
    food_pm text,
    litter text,
    checked boolean not null default false,
    comments text,
    recorded_by uuid references staff(id),
    updated_at timestamptz default now(),
    unique (booking_id, log_date)
);

alter table cattery_bookings enable row level security;
alter table cattery_daily_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cattery_bookings' and policyname = 'cattery_bookings_public_read'
  ) then
    execute 'create policy "cattery_bookings_public_read" on cattery_bookings for select using (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cattery_daily_logs' and policyname = 'cattery_daily_logs_public_read'
  ) then
    execute 'create policy "cattery_daily_logs_public_read" on cattery_daily_logs for select using (true)';
  end if;
end $$;

-- Live updates for the Cattery alarm and the daily sheet (same as
-- hospitalization_notes).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cattery_bookings') then
    execute 'alter publication supabase_realtime add table cattery_bookings';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cattery_daily_logs') then
    execute 'alter publication supabase_realtime add table cattery_daily_logs';
  end if;
end $$;
