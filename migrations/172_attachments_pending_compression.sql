-- Migration 172: which photos are ready to be compressed.
--
-- Photos are shrunk (about 300 KB, x-rays about 900 KB, see
-- lib/attachmentCompression.js) once nobody needs the full-size original
-- any more. Until now that only ran at the moment a consult was completed
-- or a pet discharged, and silently did nothing because migration 064
-- (attachments.compressed_at) had never been run. This function lists the
-- images a background sweep (/api/attachments/compress-sweep, every 10
-- minutes) should compress, oldest first:
--   * hospital stay / day procedure photos, its worksheet entries, and its
--     tests and reports: once the stay is no longer 'admitted'
--   * consult photos and its tests and reports: once the consult is
--     'complete'
--   * cattery owner-update photos: once the stay is no longer booked or
--     checked in
--   * anything else (expense receipts, client photos, ...): 2 days after
--     upload
-- is_xray marks the ones that keep the higher x-ray quality target.
-- Read-only and safe to re-run.

create or replace function attachments_pending_compression(max_rows int default 20)
returns table (id uuid, entity_type text, entity_id uuid, file_path text, is_xray boolean)
language sql stable as $$
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
        where d.id = o.entity_id and coalesce(g.name, d.type, '') ~* 'x-?ray|radiograph'))) as is_xray
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
$$;
