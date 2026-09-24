-- Migration 142: gastroscopy reports
--
-- Same pattern as ultrasound_reports/xray_reports (migrations 074/075):
-- dictate the findings, AI elaborates them into a formal clinical report
-- for the permanent medical record, a second AI pass translates that into
-- plain language for the owner, a vet reviews/edits, then shares it —
-- triggered from the specific Gastroscopy entry in diagnostics rather than
-- a standalone section, so diagnostic_id links it back to exactly which
-- procedure it's for.
--
-- Unlike the original 074/075 tables, this one is created new rather than
-- evolved in place, so it folds in from the start what two later
-- migrations added to its siblings: hospitalization_id (migration 085 —
-- a gastroscopy can happen during a day procedure/hospitalization, not
-- just a regular consult, same as ultrasound/x-ray) and client_summary
-- (migration 099 — the plain-language pass, see
-- generateClientSummaryFromScanReport in lib/anthropicClient.js).
--
-- Also created with RLS already turned on and a public-read policy, per
-- migrations/103_rls_lockdown.sql's fix to ultrasound_reports/xray_reports
-- (rather than the "disabled" state 074/075 started in and 103 later
-- closed) — reads stay open (no per-user Postgres login to scope them
-- to), writes go through supabaseAdmin, the service-role client, only.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists gastroscopy_reports (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade,
    hospitalization_id uuid references hospitalizations(id) on delete cascade,
    diagnostic_id uuid references diagnostics(id) on delete set null,
    performed_by uuid references staff(id),
    findings text,
    notes text,
    ai_summary text,          -- populated by AI elaboration of the dictated findings
    client_summary text,      -- plain-language translation of ai_summary, for the owner
    performed_at timestamptz default now(),
    created_at timestamptz default now(),
    constraint gastroscopy_reports_visit_or_hosp_check check (visit_id is not null or hospitalization_id is not null)
);

create index if not exists gastroscopy_reports_hospitalization_idx on gastroscopy_reports(hospitalization_id);

alter table gastroscopy_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gastroscopy_reports' and policyname = 'gastroscopy_reports_public_read'
  ) then
    execute 'create policy "gastroscopy_reports_public_read" on gastroscopy_reports for select using (true)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gastroscopy_reports'
  ) then
    execute 'alter publication supabase_realtime add table gastroscopy_reports';
  end if;
end $$;
