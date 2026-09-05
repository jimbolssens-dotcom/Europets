-- Migration 051: add dental as a self-bookable appointment type
--
-- Small dental cleaning (30 min) and a big dental/extractions (45 min) —
-- both fall under a vet's surgery slots (can_surgery on the roster), so
-- no roster schema change is needed, just widening the appointment_type
-- check to allow the two new values.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table intake_requests drop constraint if exists intake_requests_appointment_type_check;
alter table intake_requests add constraint intake_requests_appointment_type_check
    check (appointment_type in ('consult', 'spay', 'castration', 'dental_small', 'dental_big'));
