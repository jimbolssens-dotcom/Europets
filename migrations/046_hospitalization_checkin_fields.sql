-- Migration 046: quick check-in fields on hospitalization_notes
--
-- Powers the simplified "Quick Check-In" cleaner form (big icon tiles —
-- see app/mobile/hospitalization/[id]/checkin and lib/hospitalizationCheckin.js).
-- A check-in is just a hospitalization_notes row like the vet worksheet
-- entry, populating these instead of (or alongside) the existing
-- condition/temperature_c/weight_kg/notes fields. All nullable/free-form
-- text, same as the existing `appetite` column this reuses the pattern of
-- — the exact value sets ('normal'/'diarrhea'/'bloody', etc.) are enforced
-- client-side by the tile options, not a DB constraint.
--
-- temperature_feel is deliberately separate from the existing numeric
-- temperature_c (a vet/tech's actual thermometer reading) — this is a
-- cleaner's qualitative "feels warm/cold to the touch" flag, not a
-- clinical measurement, so the two shouldn't be conflated in one column.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalization_notes add column if not exists stool text;
alter table hospitalization_notes add column if not exists urine text;
alter table hospitalization_notes add column if not exists vomit text;
alter table hospitalization_notes add column if not exists drinking text;
alter table hospitalization_notes add column if not exists mood text;
alter table hospitalization_notes add column if not exists temperature_feel text;
