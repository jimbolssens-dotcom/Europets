-- Migration 184: one daily-sheet row per cat, not per booking
--
-- Run after the code from migration 183 is live (it saves rows per cat,
-- upserting on booking_id + patient_id + log_date). Drops the old
-- one-row-per-booking-per-day constraint so a shared bungalow's second cat
-- can have its own row for the same day. No data changes.
--
-- Safe to run more than once.

alter table cattery_daily_logs drop constraint if exists cattery_daily_logs_booking_id_log_date_key;
alter table cattery_daily_logs alter column patient_id set not null;
