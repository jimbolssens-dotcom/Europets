-- Test reports created during a hospitalization, kept separate from the
-- originating consult while using the same report safeguards.
create table if not exists hospitalization_test_reports (
  id uuid primary key default gen_random_uuid(),
  hospitalization_id uuid references hospitalizations(id) on delete cascade not null,
  report_type text not null check (report_type in ('blood', 'ultrasound', 'xray')),
  source_text text,
  result_text text,
  ai_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists hospitalization_test_reports_hospitalization_idx
  on hospitalization_test_reports(hospitalization_id, created_at);
