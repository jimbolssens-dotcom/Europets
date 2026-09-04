-- Migration 047: medication given / force-feeding done flags on
-- hospitalization_notes
--
-- Two more Quick Check-In tiles (cleaner form — see
-- app/mobile/hospitalization/[id]/checkin and lib/hospitalizationCheckin.js),
-- each a single toggle rather than a scale: was medication given, was
-- force-feeding done. Same nullable free-form text pattern as the other
-- check-in columns from migration 046.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalization_notes add column if not exists medication_given text;
alter table hospitalization_notes add column if not exists force_feeding_done text;
