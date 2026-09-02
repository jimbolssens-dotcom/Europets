-- Migration 026: make sure every table the app subscribes to via
-- postgres_changes is actually in the supabase_realtime publication.
-- Most of these were only ever added directly in the base schema.sql,
-- with no incremental migration for a database that predates that base
-- state — missing one shows up as "it only updates after I leave the
-- page and come back" instead of live in the open tab, since Postgres
-- never broadcasts the change over Realtime in the first place.
-- Safe to run regardless of which of these are already in the
-- publication.

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'patients', 'appointments', 'visits', 'consult_notes',
    'invoices', 'invoice_line_items', 'diagnostics', 'treatment_items',
    'surgical_reports', 'dental_reports', 'hospitalizations',
    'hospitalization_notes', 'attachments', 'recordings', 'clinic_settings',
    'vaccine_protocols', 'vaccinations', 'intake_requests'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
