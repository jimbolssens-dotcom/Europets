-- Migration 105: scheduling frequency on Day Treatment Plan items
--
-- Lets a plan item (app/_components/DayTreatmentPlan.jsx) declare how
-- often it needs logging, instead of every item implicitly resetting
-- "not done" each new day the way they all did before:
--   'once_daily'  — needs one log per day, repeats every day (the old,
--                   only behavior — existing rows default to this, so
--                   nothing already on a plan changes meaning)
--   'twice_daily' — needs a morning log AND an afternoon log each day,
--                   repeats every day (same shape as the Temperature
--                   vitals item from migration 104, now available for
--                   any regular task/medication too)
--   'one_time'    — needs exactly one log for the whole stay, ever, then
--                   it's done for good and never resets (typically a
--                   one-off test — see checklistItemAction's 'test'
--                   classification, which the add form defaults to this)
--
-- Doesn't apply to the two system vitals items (kind != 'task') — those
-- have their own fixed once/twice-daily rules baked into the app, not
-- this column.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalization_plan_items
  add column if not exists frequency text not null default 'once_daily'
  check (frequency in ('once_daily', 'twice_daily', 'one_time'));
