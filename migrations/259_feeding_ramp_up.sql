-- 259: a 3-day feeding ramp-up on a hospital stay (Jim, 21 Nov): from
-- feed_ramp_start the day's energy target is a third, then two thirds,
-- then the full target, split into feeds_per_day syringe feeds. Empty
-- feed_ramp_start = no ramp-up (the full target every day, as before).
-- Adds columns only. Safe to run more than once.
alter table public.hospitalizations add column if not exists feed_ramp_start date;
alter table public.hospitalizations add column if not exists feeds_per_day integer;
alter table public.hospitalizations drop constraint if exists hospitalizations_feeds_per_day_check;
alter table public.hospitalizations add constraint hospitalizations_feeds_per_day_check
  check (feeds_per_day is null or feeds_per_day between 1 and 12);
