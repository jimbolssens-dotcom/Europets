-- Migration 070: disable RLS on client_phones
--
-- client_phones (migration 055) was created after RLS was bulk-disabled
-- across every other table and never got the same treatment — Supabase
-- auto-enables RLS by default on new tables, so it's been silently
-- blocking every insert with no policy to allow one ("new row violates
-- row-level security policy for table 'client_phones'"). Matches every
-- other table in this schema: the app has no staff auth yet and talks to
-- Supabase directly with the publishable key, so RLS is intentionally off
-- everywhere else too (see schema.sql's ROW LEVEL SECURITY section).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_phones disable row level security;
