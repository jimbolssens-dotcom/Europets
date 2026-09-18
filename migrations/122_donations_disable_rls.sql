-- Migration 122: disable RLS on donations
--
-- migration 111 created the donations table but never explicitly disabled
-- row level security on it, unlike every sibling table in this app (see
-- the big "Newer Supabase projects auto-enable RLS by default on new
-- tables" comment in schema.sql). If this project has that default on,
-- donations has had RLS enabled with no policies this whole time — the
-- anon/publishable key (used for every GET and for the next-payment-number
-- lookup in app/api/donations/route.js) sees zero rows no matter how many
-- actually exist, while the service-role key (used only for INSERT/UPDATE/
-- DELETE) writes just fine. That combination is exactly what produces
-- "No payments logged yet" forever alongside "Failed to generate a unique
-- donation number" on every attempt: each logged payment actually saves,
-- invisibly, and the numbering lookup keeps recomputing the same already-
-- used number because it can never see what's really there.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table donations disable row level security;
