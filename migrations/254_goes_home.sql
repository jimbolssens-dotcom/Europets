-- Migration 254: "Goes home", apart from the dispensing fee (Jim, 15 Nov)
--
-- "Dispensed" used to do two jobs: add the dispensing fee, and be the only
-- thing that made a medicine printable and part of Home care. A medicine
-- sent home without the fee (Bravecto, CaliciX, a suspension...) fell out
-- of both. See lib/goesHome.js for how the two columns below are used.
--
-- goods_services.usually_goes_home: set once per medicine in the Catalog;
--   new lines of it start as "goes home".
-- treatment_items.goes_home: the 🏠 chip on a line; null = decided
--   automatically (lib/goesHome.js), true/false = staff's choice.
--
-- Neither changes a price. Adds two columns. Safe to run more than once.

alter table goods_services add column if not exists usually_goes_home boolean not null default false;
alter table treatment_items add column if not exists goes_home boolean;
