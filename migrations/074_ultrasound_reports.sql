-- Migration 072: ultrasound reports
--
-- Same shape as surgical_reports/dental_reports (migrations 025-ish era):
-- dictate the findings, AI elaborates them into a client-facing report,
-- vet reviews/edits, then shares it — except triggered from the specific
-- Ultrasound diagnostic entry on a consult rather than a standalone
-- "Procedures" section, so diagnostic_id links it back to exactly which
-- scan it's for.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists ultrasound_reports (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null,
    diagnostic_id uuid references diagnostics(id) on delete set null,
    performed_by uuid references staff(id),
    findings text,
    notes text,
    ai_summary text,          -- populated by AI elaboration of the dictated findings
    performed_at timestamptz default now(),
    created_at timestamptz default now()
);

alter table ultrasound_reports disable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ultrasound_reports'
  ) then
    execute 'alter publication supabase_realtime add table ultrasound_reports';
  end if;
end $$;
