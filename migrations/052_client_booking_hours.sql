-- Migration 052: editable client self-booking hours
--
-- The two windows a client can request a slot in (morning/afternoon) were
-- hardcoded (9am-1pm, 4:30pm-7pm) — now editable on the Settings page,
-- since the clinic's actual hours change from time to time.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table clinic_settings add column if not exists booking_morning_start time not null default '09:00';
alter table clinic_settings add column if not exists booking_morning_end time not null default '13:00';
alter table clinic_settings add column if not exists booking_afternoon_start time not null default '16:30';
alter table clinic_settings add column if not exists booking_afternoon_end time not null default '19:00';
