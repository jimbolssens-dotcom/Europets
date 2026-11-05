-- Migration 244: feeding log on hospital stays (Jim, 5 Nov)
--
-- A force feed is saved as a normal worksheet entry with how much went in:
-- feed_ml of feed_food (a key from FEEDING_FOODS in lib/feeding.js), and
-- feed_kcal worked out from it, so the day's total can be compared with the
-- stay's energy target. Eating by itself uses the existing appetite column
-- (good / reduced / none) and feed_kind = 'self'.
--
-- energy_target_kcal: the stay's daily energy target when staff set one;
-- empty means RER (70 x kg^0.75) from the latest weight.
--
-- Adds columns only. Safe to run more than once.

alter table hospitalization_notes add column if not exists feed_kind text;
alter table hospitalization_notes add column if not exists feed_ml numeric;
alter table hospitalization_notes add column if not exists feed_food text;
alter table hospitalization_notes add column if not exists feed_kcal numeric;

alter table hospitalization_notes drop constraint if exists hospitalization_notes_feed_kind_check;
alter table hospitalization_notes add constraint hospitalization_notes_feed_kind_check
  check (feed_kind is null or feed_kind in ('forced', 'self'));

alter table hospitalizations add column if not exists energy_target_kcal numeric;
