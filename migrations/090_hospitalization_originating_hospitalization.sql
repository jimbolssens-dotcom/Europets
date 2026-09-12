-- Migration 090: link a day procedure booked from an active admission
--
-- A patient who's already admitted overnight sometimes needs a same-day
-- procedure (a dental, a mass removal, etc.) during that stay. Until now
-- there was no way to book that without discharging them first — staff
-- just logged it as a plan-item task on the SAME admission, so it never
-- showed up on the Day Procedures list or the Day Procedure Wall.
--
-- originating_hospitalization_id lets a "Book Day Procedure" action on
-- the hospitalization page spin off a genuine second hospitalizations row
-- (kind: 'day_procedure', see migration 088) for the same patient, linked
-- back to the admission it came from, while that admission stays open in
-- parallel. Unlike originating_visit_id (one consult -> one hospital
-- case), this is intentionally one-to-many: a single stay can have
-- several procedures booked off it over the course of the admission.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalizations add column if not exists originating_hospitalization_id uuid references hospitalizations(id);
