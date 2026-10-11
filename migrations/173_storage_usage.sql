-- Migration 173: storage usage for the Storage page (Settings > More).
-- One read-only call returning how much file storage and database space
-- the clinic is using, what the files are (by record type), and how far
-- the photo compression sweep has got (see migration 172). security
-- definer because the storage schema isn't readable through the API;
-- execute is limited to the server's service role. Safe to re-run.

create or replace function storage_usage()
returns jsonb
language sql stable security definer
set search_path = public, storage
as $$
  select jsonb_build_object(
    'files_bytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0),
    'files_count', (select count(*) from storage.objects),
    'database_bytes', pg_database_size(current_database()),
    'by_folder', coalesce((
      select jsonb_agg(jsonb_build_object('folder', folder, 'files', files, 'bytes', bytes) order by bytes desc)
      from (
        select split_part(name, '/', 1) as folder, count(*) as files, sum((metadata->>'size')::bigint) as bytes
        from storage.objects group by 1
      ) f
    ), '[]'::jsonb),
    'photos_compressed', (select count(*) from attachments where compressed_at is not null),
    'photos_waiting', (select count(*) from attachments_pending_compression(100000))
  );
$$;

revoke all on function storage_usage() from public, anon, authenticated;
grant execute on function storage_usage() to service_role;
