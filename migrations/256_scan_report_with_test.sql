-- 256: an ultrasound, x-ray or gastroscopy test comes with its report (Jim,
-- 19 Nov: "one scan, one report card, the same everywhere").
--
-- Whichever way a scan is logged (a consult's Tests, a stay's "Order a
-- test", the worksheet, the Day Treatment Plan, the day procedure
-- checklist or the phone), it ends up as a diagnostics row; this trigger
-- gives that row its report straight away, so the report card is there
-- to dictate, type findings and generate, with no separate "start a
-- report" step.
--
-- One report per scan study: an "X-ray first" and "X-ray second" (two
-- billed views of the same study), or the same scan tapped twice, share
-- the report already started on that consult or stay the same day, as
-- long as it hasn't been written yet. A scan after the report was written
-- (e.g. a repeat ultrasound that evening) gets its own.
--
-- Removing a scan test hands its report to another scan of the same kind
-- on the case, else removes the report if it is still an empty shell (no
-- text, no dictation, no file). A report with anything in it is kept.
--
-- Safe to re-run.

create or replace function public.scan_report_kind(test_name text)
returns text
language sql
immutable
as $$
  select case
    when test_name ~* 'ultrasound' then 'ultrasound'
    when test_name ~* 'gastroscop' then 'gastroscopy'
    when test_name ~* 'x-?ray|radiograph' then 'xray'
  end
$$;

create or replace function public.diagnostics_scan_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  tbl text;
  existing uuid;
  today date := (now() at time zone 'Asia/Dubai')::date;
begin
  select public.scan_report_kind(g.name) into kind from goods_services g where g.id = new.goods_service_id;
  if kind is null then
    return new;
  end if;
  tbl := kind || '_reports';

  execute format('select id from %I where diagnostic_id = $1 limit 1', tbl) into existing using new.id;
  if existing is not null then
    return new;
  end if;

  execute format(
    'select id from %I
      where ((visit_id is not null and visit_id = $1) or (hospitalization_id is not null and hospitalization_id = $2))
        and ai_summary is null
        and (performed_at at time zone ''Asia/Dubai'')::date = $3
      order by created_at
      limit 1', tbl)
    into existing using new.visit_id, new.hospitalization_id, today;
  if existing is not null then
    execute format('update %I set diagnostic_id = $1 where id = $2 and diagnostic_id is null', tbl) using new.id, existing;
    return new;
  end if;

  execute format(
    'insert into %I (visit_id, hospitalization_id, diagnostic_id, findings) values ($1, $2, $3, $4)', tbl)
    using new.visit_id, new.hospitalization_id, new.id, nullif(btrim(coalesce(new.result, '')), '');
  return new;
end;
$$;

create or replace function public.diagnostics_scan_report_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  tbl text;
  report record;
  other uuid;
begin
  select public.scan_report_kind(g.name) into kind from goods_services g where g.id = old.goods_service_id;
  if kind is null then
    return old;
  end if;
  tbl := kind || '_reports';

  for report in execute format('select id, findings, notes, ai_summary, client_summary from %I where diagnostic_id = $1', tbl) using old.id loop
    select d.id into other
      from diagnostics d join goods_services g on g.id = d.goods_service_id
     where d.id <> old.id
       and public.scan_report_kind(g.name) = kind
       and ((old.visit_id is not null and d.visit_id = old.visit_id)
         or (old.hospitalization_id is not null and d.hospitalization_id = old.hospitalization_id))
     order by d.created_at
     limit 1;
    if other is not null then
      execute format('update %I set diagnostic_id = $1 where id = $2', tbl) using other, report.id;
    elsif coalesce(report.findings, report.notes, report.ai_summary, report.client_summary) is null
      and not exists (select 1 from recordings r where r.entity_type = kind || '_report' and r.entity_id = report.id)
      and not exists (select 1 from attachments a where a.entity_type = kind || '_report' and a.entity_id = report.id) then
      execute format('delete from %I where id = $1', tbl) using report.id;
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists diagnostics_scan_report on public.diagnostics;
create trigger diagnostics_scan_report
  after insert on public.diagnostics
  for each row execute function public.diagnostics_scan_report();

drop trigger if exists diagnostics_scan_report_release on public.diagnostics;
create trigger diagnostics_scan_report_release
  before delete on public.diagnostics
  for each row execute function public.diagnostics_scan_report_release();
