-- Migration 253: course length for a daily hospital medicine (Jim, 15 Nov)
--
-- The Day Treatment Plan shows a dose bar on each once- or twice-daily task
-- (app/_components/DayTreatmentPlan.jsx, lib/doseCourse.js): one block per
-- day, filled as doses are logged. course_days is how many days the course
-- runs (set when adding the task or by long-press); the bar is then the
-- whole course ("Day 3 of 5"). Empty means open-ended: the bar grows a
-- block a day.
--
-- Adds a column. Safe to run more than once.

alter table hospitalization_plan_items add column if not exists course_days int;

alter table hospitalization_plan_items drop constraint if exists hospitalization_plan_items_course_days_check;
alter table hospitalization_plan_items add constraint hospitalization_plan_items_course_days_check
  check (course_days is null or course_days between 1 and 120);
