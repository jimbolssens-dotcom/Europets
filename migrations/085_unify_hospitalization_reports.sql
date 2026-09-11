-- Migration 085: unify hospitalization test reports into the same
-- diagnostics/surgical_reports/dental_reports/ultrasound_reports/
-- xray_reports tables the consult side already uses, instead of the
-- separate hospitalization_test_reports table (migration 082/083).
--
-- Each of the five tables gets a nullable hospitalization_id alongside
-- its now-nullable visit_id (a row belongs to a consult, a hospital
-- stay, or — going forward, if a hospitalization outlives its
-- originating consult's own record-keeping — conceivably both; at
-- least one is required). This gives hospitalization tests the same
-- catalog/billing link (diagnostics.goods_service_id -> treatment_items)
-- consult diagnostics already have, which hospitalization_test_reports
-- never had at all.
--
-- hospitalization_test_reports let staff generate an AI client-facing
-- narrative specifically for a blood/PCR result (ai_summary), a
-- capability consult diagnostics never had — consult diagnostics are
-- shared as one combined "Tests" PDF for the whole visit instead (see
-- /api/visits/:id/test-report-pdf, now mirrored for hospitalizations).
-- To keep one consistent workflow, that per-test narrative isn't carried
-- forward as a new column; any old ai_summary text is folded into the
-- migrated row's own result field below instead, so nothing is lost.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table diagnostics add column if not exists hospitalization_id uuid references hospitalizations(id) on delete cascade;
alter table diagnostics alter column visit_id drop not null;

alter table surgical_reports add column if not exists hospitalization_id uuid references hospitalizations(id) on delete cascade;
alter table surgical_reports alter column visit_id drop not null;

alter table dental_reports add column if not exists hospitalization_id uuid references hospitalizations(id) on delete cascade;
alter table dental_reports alter column visit_id drop not null;

alter table ultrasound_reports add column if not exists hospitalization_id uuid references hospitalizations(id) on delete cascade;
alter table ultrasound_reports alter column visit_id drop not null;

alter table xray_reports add column if not exists hospitalization_id uuid references hospitalizations(id) on delete cascade;
alter table xray_reports alter column visit_id drop not null;

do $$
begin
  alter table diagnostics drop constraint if exists diagnostics_visit_or_hosp_check;
  alter table diagnostics add constraint diagnostics_visit_or_hosp_check
    check (visit_id is not null or hospitalization_id is not null);

  alter table surgical_reports drop constraint if exists surgical_reports_visit_or_hosp_check;
  alter table surgical_reports add constraint surgical_reports_visit_or_hosp_check
    check (visit_id is not null or hospitalization_id is not null);

  alter table dental_reports drop constraint if exists dental_reports_visit_or_hosp_check;
  alter table dental_reports add constraint dental_reports_visit_or_hosp_check
    check (visit_id is not null or hospitalization_id is not null);

  alter table ultrasound_reports drop constraint if exists ultrasound_reports_visit_or_hosp_check;
  alter table ultrasound_reports add constraint ultrasound_reports_visit_or_hosp_check
    check (visit_id is not null or hospitalization_id is not null);

  alter table xray_reports drop constraint if exists xray_reports_visit_or_hosp_check;
  alter table xray_reports add constraint xray_reports_visit_or_hosp_check
    check (visit_id is not null or hospitalization_id is not null);
end $$;

create index if not exists diagnostics_hospitalization_idx on diagnostics(hospitalization_id);
create index if not exists surgical_reports_hospitalization_idx on surgical_reports(hospitalization_id);
create index if not exists dental_reports_hospitalization_idx on dental_reports(hospitalization_id);
create index if not exists ultrasound_reports_hospitalization_idx on ultrasound_reports(hospitalization_id);
create index if not exists xray_reports_hospitalization_idx on xray_reports(hospitalization_id);

-- ============ MIGRATE EXISTING hospitalization_test_reports ROWS ============
-- Best-effort mapping of historical rows into their matching table. None
-- of these were ever catalog/billing-linked (hospitalization_test_reports
-- never had that), so goods_service_id/treatment_item_id stay null —
-- accurately representing that they were never billed under the old
-- system either.
do $$
begin
  if to_regclass('public.hospitalization_test_reports') is not null then

    insert into diagnostics (hospitalization_id, type, description, result, created_at)
    select
      hospitalization_id,
      report_type,
      source_text,
      case
        when ai_summary is not null and result_text is not null then result_text || E'\n\n' || ai_summary
        else coalesce(result_text, ai_summary)
      end,
      created_at
    from hospitalization_test_reports
    where report_type in ('blood', 'pcr');

    insert into dental_reports (hospitalization_id, findings, ai_summary, performed_at, created_at)
    select hospitalization_id, coalesce(source_text, result_text), ai_summary, created_at, created_at
    from hospitalization_test_reports
    where report_type = 'dental';

    insert into surgical_reports (hospitalization_id, notes, ai_summary, performed_at, created_at)
    select hospitalization_id, coalesce(source_text, result_text), ai_summary, created_at, created_at
    from hospitalization_test_reports
    where report_type = 'surgical';

    insert into ultrasound_reports (hospitalization_id, findings, ai_summary, performed_at, created_at)
    select hospitalization_id, coalesce(source_text, result_text), ai_summary, created_at, created_at
    from hospitalization_test_reports
    where report_type = 'ultrasound';

    insert into xray_reports (hospitalization_id, findings, ai_summary, performed_at, created_at)
    select hospitalization_id, coalesce(source_text, result_text), ai_summary, created_at, created_at
    from hospitalization_test_reports
    where report_type = 'xray';

    drop table hospitalization_test_reports;
  end if;
end $$;
