-- Migration 044: drop staff_schedules
--
-- Removes the recurring weekly working-hours template (migration 028).
-- It only ever produced a soft, overridable warning when booking a vet
-- outside their usual hours, and in practice staff weren't keeping it
-- filled in, so it silently did nothing useful most of the time.
--
-- The dated Staff Roster (staff_roster_entries, migration 034 — "who's
-- actually in on this specific date, morning/afternoon") is now the only
-- source of truth the appointment booking check uses: it's a hard block,
-- no override, once that date+shift has any roster data at all. See the
-- comment at the top of app/api/appointments/route.js.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

drop table if exists staff_schedules;
