-- Migration 136: close the remaining RLS gap (client_messages, donations,
-- invoice_discounts, client_otp_codes)
--
-- migrations/103_rls_lockdown.sql (plus 116 for video_consults) already
-- turned RLS back on, with an open-read policy, for every table that
-- existed at the time — same pattern as 093's original fix for clients/
-- client_phones/patients: the app's own publishable key has no per-user
-- login to scope reads to (real authorization happens in the Next.js API
-- route layer instead — staff PIN / client session checks), so reads stay
-- open, but only supabaseAdmin (the service-role client, which bypasses
-- RLS entirely) can write. See lib/supabaseAdmin.js.
--
-- Four tables created AFTER 103 never got the same treatment — each has
-- its own later migration that explicitly DISABLED RLS on it instead
-- (120_client_messages.sql, 122_donations_disable_rls.sql,
-- 123_invoice_discounts.sql, 128_client_otp_codes.sql), almost certainly
-- because Supabase auto-enables RLS with zero policies on a brand-new
-- table, which silently breaks every read — and disabling it outright was
-- the fast fix instead of adding the same open-read policy 093/103
-- already established as the correct one. That left these four tables
-- fully exposed: with RLS off, the publishable key (necessarily embedded
-- in the browser bundle for realtime subscriptions to work) grants
-- unauthenticated read/write access to them via Supabase's REST API
-- directly, bypassing the app's own auth checks entirely.
--
-- Confirmed via a full audit of every app/api/**/route.js file (and every
-- lib/*.js helper those routes call into): every single insert/update/
-- upsert/delete against all four tables already goes through
-- supabaseAdmin. No application code needs to change before running this.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_messages enable row level security;
drop policy if exists "client_messages_public_read" on client_messages;
create policy "client_messages_public_read" on client_messages for select using (true);

alter table donations enable row level security;
drop policy if exists "donations_public_read" on donations;
create policy "donations_public_read" on donations for select using (true);

alter table invoice_discounts enable row level security;
drop policy if exists "invoice_discounts_public_read" on invoice_discounts;
create policy "invoice_discounts_public_read" on invoice_discounts for select using (true);

-- client_otp_codes is deliberately different: nothing in the app ever
-- reads or writes it except lib/clientAppAuth.js, exclusively via
-- supabaseAdmin (confirmed zero references anywhere else). An open-read
-- policy here would still let anyone enumerate which phone numbers have
-- pending/consumed OTP requests and their attempt counts — real exposure
-- for zero functional benefit, since nothing needs anon access to it at
-- all. So: RLS on, no policies at all — anon gets zero access, service
-- role (already exempt from RLS) is unaffected.
alter table client_otp_codes enable row level security;
