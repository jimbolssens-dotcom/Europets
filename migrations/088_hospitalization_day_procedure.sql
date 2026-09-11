-- Migration 088: day procedures
--
-- A day procedure (patient dropped off in the morning, picked up the same
-- day — a dental, a spay/neuter, a stay for a vaccine + microchip, etc.)
-- is modeled as a hospitalizations row rather than a new table: it already
-- has everything a day case needs (the daily worksheet/plan-item checklist,
-- attachments, reports, invoicing, consent forms), just used for a single
-- day instead of a multi-day stay. `kind` distinguishes the two so the
-- hospitalization list can group/label them separately, and a day
-- procedure can be "promoted" to a full admission later just by flipping
-- this column — no new record, nothing re-created.
--
-- `appointment_id` mirrors visits.appointment_id: a booked appointment of
-- type 'surgery' checks straight into a day procedure instead of a
-- consult (see app/api/hospitalizations and the appointments page).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalizations add column if not exists kind text not null default 'admission'
  check (kind in ('admission', 'day_procedure'));

alter table hospitalizations add column if not exists appointment_id uuid references appointments(id);
