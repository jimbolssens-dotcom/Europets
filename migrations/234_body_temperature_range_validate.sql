-- Migration 234: the old impossible temperatures are corrected (Jim, 27 Oct:
-- readings in the three hundreds were a missed decimal point, 67.9 was 37.9,
-- the rest cleared), so the range checks from migration 233 now cover every
-- row, old ones included. Safe to re-run.
--
-- Data correction run alongside it, once:
--   update visits set temperature_c = temperature_c / 10 where temperature_c between 300 and 399;
--   update hospitalization_notes set temperature_c = temperature_c / 10 where temperature_c between 300 and 399;
--   update hospitalization_notes set temperature_c = 37.9 where temperature_c = 67.9;
--   update visits set temperature_c = null where temperature_c < 32 or temperature_c > 42;
--   update hospitalization_notes set temperature_c = null where temperature_c < 32 or temperature_c > 42;

alter table visits validate constraint visits_temperature_c_range;
alter table hospitalization_notes validate constraint hospitalization_notes_temperature_c_range;
