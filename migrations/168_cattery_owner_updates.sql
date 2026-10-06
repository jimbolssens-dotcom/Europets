-- Migration 168: an owner-facing daily update on the cattery sheet
--
-- cattery_daily_logs.comments (migration 167) is the staff column from the
-- paper cage sheet: internal notes, never shown to the client. This adds a
-- separate update_for_owner line that IS shown, together with that day's
-- photos (attachments with entity_type 'cattery_log'), on the client's
-- cattery care page (app/portal/cattery/[id]) and in the client app.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table cattery_daily_logs add column if not exists update_for_owner text;
