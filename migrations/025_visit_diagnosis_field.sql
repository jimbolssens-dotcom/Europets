-- Migration 025: add visits.diagnosis — a structured Diagnosis field on
-- the consult record, alongside the existing anamnesis/findings/prognosis/
-- treatment_notes fields under Vitals & Exam.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

alter table visits add column if not exists diagnosis text;
