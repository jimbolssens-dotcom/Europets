-- Migration 104: Temperature/Weight as automatic Day Treatment Plan items
--
-- Replaces the free-form Weight/Temperature fields on the "Add Worksheet
-- Entry" form with two system-generated Day Treatment Plan items every
-- hospitalization gets automatically, that require a typed number to log
-- rather than a bare tap (see app/_components/DayTreatmentPlan.jsx) — same
-- hospitalization_notes.weight_kg/temperature_c columns underneath, just a
-- different, mandatory-per-reading way of getting a value into them.
--
-- `kind` distinguishes these two from every other (staff-added) plan item,
-- which stays 'task'. Nothing else about hospitalization_plan_items
-- changes — administration_method/is_surgical are simply null/false on a
-- vitals item, same defaults as any non-medication task.
--
-- Run this in your Supabase SQL editor. Safe to run more than once — the
-- backfill only inserts a Temperature/Weight item where one doesn't
-- already exist for that hospitalization.

alter table hospitalization_plan_items
  add column if not exists kind text not null default 'task'
  check (kind in ('task', 'vitals_temperature', 'vitals_weight'));

-- Backfill: every hospitalization still open (admission or day procedure —
-- both use status='admitted' while in progress) gets the two boxes now,
-- same as a newly-created one gets going forward (see POST
-- /api/hospitalizations). A discharged/historical stay is left as-is —
-- there's nothing to log anymore, and adding the boxes retroactively would
-- just misrepresent what was actually tracked during that stay.
insert into hospitalization_plan_items (hospitalization_id, label, kind)
select h.id, 'Temperature', 'vitals_temperature'
from hospitalizations h
where h.status = 'admitted'
  and not exists (
    select 1 from hospitalization_plan_items p
    where p.hospitalization_id = h.id and p.kind = 'vitals_temperature'
  );

insert into hospitalization_plan_items (hospitalization_id, label, kind)
select h.id, 'Weight', 'vitals_weight'
from hospitalizations h
where h.status = 'admitted'
  and not exists (
    select 1 from hospitalization_plan_items p
    where p.hospitalization_id = h.id and p.kind = 'vitals_weight'
  );
