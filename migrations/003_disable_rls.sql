-- Migration 003: explicitly disable RLS on every table.
-- Newer Supabase projects auto-enable RLS by default on new tables,
-- which blocks all access for the publishable/anon key until policies
-- are added. This app has no staff auth yet, so — as documented in
-- schema.sql and the README — RLS is intentionally off for now.

alter table staff disable row level security;
alter table clients disable row level security;
alter table patients disable row level security;
alter table rooms disable row level security;
alter table appointments disable row level security;
alter table visits disable row level security;
alter table consult_notes disable row level security;
alter table goods_services disable row level security;
alter table invoices disable row level security;
alter table invoice_line_items disable row level security;
