-- Migration 019: attach medications/goods/services to the specific
-- worksheet entry they were given during (not the admission as a whole —
-- supersedes migration 018's treatment_items.hospitalization_id), and let
-- a worksheet entry record the patient's weight.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

-- Safe to run whether or not migration 018 has been applied yet.
alter table treatment_items alter column visit_id drop not null;
alter table treatment_items drop column if exists hospitalization_id;
alter table treatment_items add column if not exists hospitalization_note_id uuid
    references hospitalization_notes(id) on delete cascade;

alter table hospitalization_notes add column if not exists weight_kg numeric(6,2);
