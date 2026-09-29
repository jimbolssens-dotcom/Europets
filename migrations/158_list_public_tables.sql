-- Migration 158: list_public_tables()
--
-- Lets the full-database backup (Accounting -> Database Backup, see
-- app/api/accounting/database-backup/route.js) discover every table to
-- export by asking Postgres directly, rather than keeping a hand-maintained
-- list in application code that would silently go stale the next time a
-- migration adds a table.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create or replace function list_public_tables()
returns table(table_name text)
language sql
stable
as $$
  select tablename::text
  from pg_tables
  where schemaname = 'public'
  order by tablename;
$$;
