-- 192: worksheet (hospitalization_note) photos count as x-rays, and keep
-- the ~900 KB x-ray target, when their entry names an x-ray/radiograph in
-- its text or in the item logged on it. Same function as migration 172
-- otherwise. Safe to re-run.
create or replace function public.attachments_pending_compression(max_rows integer default 20)
 returns table(id uuid, entity_type text, entity_id uuid, file_path text, is_xray boolean)
 language sql
 stable
 set search_path to 'public'
as $function$
  with img as (
    select a.* from attachments a
    where a.compressed_at is null
      and (a.content_type like 'image/%' or a.file_name ~* '\.(jpe?g|png|heic|heif|webp)$')
  ),
  owner as (
    select img.*,
      case img.entity_type
        when 'hospitalization' then img.entity_id
        when 'hospitalization_note' then (select n.hospitalization_id from hospitalization_notes n where n.id = img.entity_id)
        when 'diagnostic' then (select d.hospitalization_id from diagnostics d where d.id = img.entity_id)
        when 'xray_report' then (select r.hospitalization_id from xray_reports r where r.id = img.entity_id)
        when 'ultrasound_report' then (select r.hospitalization_id from ultrasound_reports r where r.id = img.entity_id)
        when 'gastroscopy_report' then (select r.hospitalization_id from gastroscopy_reports r where r.id = img.entity_id)
        when 'surgical_report' then (select r.hospitalization_id from surgical_reports r where r.id = img.entity_id)
        when 'dental_report' then (select r.hospitalization_id from dental_reports r where r.id = img.entity_id)
      end as hosp_id,
      case img.entity_type
        when 'visit' then img.entity_id
        when 'diagnostic' then (select d.visit_id from diagnostics d where d.id = img.entity_id)
        when 'xray_report' then (select r.visit_id from xray_reports r where r.id = img.entity_id)
        when 'ultrasound_report' then (select r.visit_id from ultrasound_reports r where r.id = img.entity_id)
        when 'gastroscopy_report' then (select r.visit_id from gastroscopy_reports r where r.id = img.entity_id)
        when 'surgical_report' then (select r.visit_id from surgical_reports r where r.id = img.entity_id)
        when 'dental_report' then (select r.visit_id from dental_reports r where r.id = img.entity_id)
      end as visit_id,
      case when img.entity_type = 'cattery_log' then
        (select b.status from cattery_daily_logs l join cattery_bookings b on b.id = l.booking_id where l.id = img.entity_id)
      end as cattery_status
    from img
  )
  select o.id, o.entity_type, o.entity_id, o.file_path,
    (o.entity_type = 'xray_report'
      or (o.entity_type = 'diagnostic' and exists (
        select 1 from diagnostics d left join goods_services g on g.id = d.goods_service_id
        where d.id = o.entity_id and coalesce(g.name, d.type, '') ~* 'x-?ray|radiograph'))
      or (o.entity_type = 'hospitalization_note' and (
        exists (select 1 from hospitalization_notes n where n.id = o.entity_id and coalesce(n.notes, '') ~* 'x-?ray|radiograph')
        or exists (select 1 from treatment_items t join goods_services g on g.id = t.goods_service_id
                   where t.hospitalization_note_id = o.entity_id and g.name ~* 'x-?ray|radiograph')))) as is_xray
  from owner o
  where case
    when o.hosp_id is not null then coalesce((select h.status from hospitalizations h where h.id = o.hosp_id), 'gone') <> 'admitted'
    when o.visit_id is not null then coalesce((select v.status from visits v where v.id = o.visit_id), 'gone') = 'complete'
    when o.entity_type = 'cattery_log' then coalesce(o.cattery_status, 'gone') not in ('requested', 'booked', 'checked_in')
    when o.entity_type in ('hospitalization', 'hospitalization_note', 'visit', 'diagnostic', 'xray_report',
                           'ultrasound_report', 'gastroscopy_report', 'surgical_report', 'dental_report') then true
    else o.created_at < now() - interval '2 days'
  end
  order by o.created_at
  limit max_rows;
$function$;
