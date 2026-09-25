-- Migration 145: one-off "transfer consult meds to the Day Treatment Plan" marker
--
-- Replaces the old always-visible "given during the consult" reference
-- list + tap-time duplicate-check on the Day Treatment Plan (which staff
-- found unmanageable as a permanent fixture, especially on tablet/phone)
-- with a one-off transfer step: everything given during the consult this
-- admission started from gets added to the plan as an already-logged,
-- unbilled one-time task, which staff can then upgrade to once/twice-daily
-- via the plan item's normal edit panel if the vet wants it continued.
--
-- This column just remembers that the one-off prompt has been handled
-- (transferred, or explicitly skipped) so it doesn't keep reappearing —
-- see PATCH /api/hospitalizations/:id's mark_consult_meds_transfer_handled
-- and app/_components/DayTreatmentPlan.jsx.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalizations add column if not exists consult_meds_transfer_handled_at timestamptz;
