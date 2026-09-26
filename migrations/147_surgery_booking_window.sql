-- Migration 147: a separate, stricter self-booking window for surgery-type
-- appointments (spay/castration/dental) than the general morning consult
-- window.
--
-- Surgery-type slots (see lib/appointmentBooking.js's isSurgeryType) used to
-- share the same booking_morning_start/booking_morning_end window as a
-- plain consult (9am-1pm by default) — clinic policy is that no surgery
-- should start before 10:30am, and every surgery slot must finish by 1pm
-- (anesthesia/recovery needs the afternoon clear), which the shared window
-- couldn't express. Editable on the Settings page, same pattern as the
-- morning/afternoon windows (migration 052).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table clinic_settings add column if not exists booking_surgery_start time not null default '10:30';
alter table clinic_settings add column if not exists booking_surgery_end time not null default '13:00';
