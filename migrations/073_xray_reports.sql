-- Migration 073: x-ray reports
--
-- Same as ultrasound_reports (migration 072): dictate the findings, AI
-- elaborates them into a client-facing report, vet reviews/edits, then
-- shares it — triggered from the specific X-ray entry in diagnostics
-- rather than a standalone section, so diagnostic_id links it back to
-- exactly which radiograph it's for.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists xray_reports (
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

alter table xray_reports disable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'xray_reports'
  ) then
    execute 'alter publication supabase_realtime add table xray_reports';
  end if;
end $$;
