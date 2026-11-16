-- Migration 255: "Every other day" for a hospital plan task (Jim, 16 Nov)
--
-- Besides once a day, morning & afternoon and one-time only, a task (a
-- medicine, a check) can now be due every other day: on the day it went on
-- the plan, then every second day (lib/wallPlanItems.js dueOn). The wall
-- shows it only on its days, the plan tile says "Not due today" in between,
-- and its dose bar leaves those days empty (lib/doseCourse.js).
--
-- Widens the allowed values. Safe to run more than once.

alter table hospitalization_plan_items drop constraint if exists hospitalization_plan_items_frequency_check;
alter table hospitalization_plan_items add constraint hospitalization_plan_items_frequency_check
  check (frequency in ('once_daily', 'twice_daily', 'every_other_day', 'one_time'));
