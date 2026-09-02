-- Migration 022: long-term, patient-level notes ("aggressive with
-- handling", "allergic to penicillin", "reacted badly to the rabies
-- vaccine") that persist across a patient's whole record rather than
-- being tied to one visit — entered from a consult, shown on the
-- patient's own page too. Deliberately separate from consult_notes
-- (per-visit) and patients.notes (a single free-text field).
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists patient_alerts (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id) on delete cascade not null,
    author_id uuid references staff(id),
    note_text text not null,
    created_at timestamptz default now()
);

create index if not exists idx_patient_alerts_patient on patient_alerts(patient_id);

-- Supabase auto-enables RLS on new tables by default, which blocks all
-- access for the publishable/anon key until policies are added. This app
-- has no staff auth yet, so — like every other table (see
-- migrations/003_disable_rls.sql) — RLS is intentionally off for now.
alter table patient_alerts disable row level security;
