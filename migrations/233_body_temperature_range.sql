-- Migration 233: a body temperature is always between 32 and 42 °C
-- (lib/bodyTemperature.js). NOT VALID: applies to every new or changed
-- reading, and leaves the 14 impossible old ones (typos such as 389 or 3.9)
-- as they are until they're corrected. Safe to re-run.

alter table visits drop constraint if exists visits_temperature_c_range;
alter table visits add constraint visits_temperature_c_range
  check (temperature_c is null or temperature_c between 32 and 42) not valid;

alter table hospitalization_notes drop constraint if exists hospitalization_notes_temperature_c_range;
alter table hospitalization_notes add constraint hospitalization_notes_temperature_c_range
  check (temperature_c is null or temperature_c between 32 and 42) not valid;
