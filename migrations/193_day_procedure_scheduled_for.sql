-- 193: a day procedure booked ahead from a consult ("Tomorrow" in the
-- consult's Day Procedure menu): the cat stays in a cage overnight and the
-- procedure is done on scheduled_for. Null for an ordinary same-day one,
-- whose day is still its admitted_at date. Safe to re-run.
alter table public.hospitalizations add column if not exists scheduled_for date;
