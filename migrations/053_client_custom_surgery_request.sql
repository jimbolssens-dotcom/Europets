-- Migration 053: client-requested non-standard surgery
--
-- A client wanting something other than the fixed standard spay/
-- castration/dental options can now send a free-text request instead of
-- being turned away to "contact the clinic" — they describe the
-- procedure and suggest a preferred day, but don't pick an exact time
-- (they have no way to know how long it'll take); staff pick the actual
-- vet/time/duration when approving it (see app/api/intake-requests/[id]).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table intake_requests drop constraint if exists intake_requests_appointment_type_check;
alter table intake_requests add constraint intake_requests_appointment_type_check
    check (appointment_type in ('consult', 'spay', 'castration', 'dental_small', 'dental_big', 'other_surgery'));

alter table intake_requests add column if not exists custom_surgery_reason text;
alter table intake_requests add column if not exists preferred_date date;
