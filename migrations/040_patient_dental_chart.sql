-- 040_patient_dental_chart.sql
-- A lifetime, per-patient dental chart: which teeth have been extracted
-- vs. were already missing, so it carries across every dental report for
-- that patient rather than resetting each visit. Stored as a flat
-- {toothId: 'extracted' | 'missing'} map — a present tooth simply has no
-- entry — keyed per lib/dentalChartLayout.js's tooth ids (dog: anatomical
-- shorthand like "UR_C1"; cat: Triadan numbers like "109").

alter table patients
    add column if not exists dental_chart jsonb not null default '{}'::jsonb;

alter table patients disable row level security;
