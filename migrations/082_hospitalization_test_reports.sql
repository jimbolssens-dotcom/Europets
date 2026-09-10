-- Test reports created during a hospitalization, kept separate from the
-- originating consult while using the same report safeguards.
create table if not exists hospitalization_test_reports (
  id uuid primary key default gen_random_uuid(),
  hospitalization_id uuid references hospitalizations(id) on delete cascade not null,
  report_type text not null check (report_type in ('blood', 'ultrasound', 'xray', 'dental', 'surgical')),
  source_text text,
  result_text text,
  ai_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists hospitalization_test_reports_hospitalization_idx
  on hospitalization_test_reports(hospitalization_id, created_at);

do $$
begin
  alter table hospitalization_test_reports drop constraint if exists hospitalization_test_reports_report_type_check;
  alter table hospitalization_test_reports add constraint hospitalization_test_reports_report_type_check
    check (report_type in ('blood', 'ultrasound', 'xray', 'dental', 'surgical'));
exception when undefined_table then null;
end $$;
