-- Migration 095: fix a medication's SC/IM route on the catalog item again,
-- instead of choosing it each time it's given
--
-- Reverts migration 078. That migration made an injectable catalog item
-- just say "injectable", leaving the exact subcutaneous/intramuscular
-- route to be chosen every single time it was added to a plan/treatment
-- item/invoice. In practice a given medication's route almost never
-- changes case to case, so that per-use choice was just extra friction —
-- this fixes it back onto the catalog item once, the same as any other
-- one-time setup, and every place that adds the item now copies it
-- straight across with nothing left to pick (see
-- lib/administrationMethods.js).
--
-- Existing "injectable" catalog items can't have their true historical
-- route restored (migration 078 discarded it), so they're defaulted to
-- 'sc' (subcutaneous is the more common route in this clinic's catalog) —
-- review Settings > Goods & Services > Products after running this and
-- fix any that should be 'im' (intramuscular) instead.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table goods_services drop constraint if exists goods_services_administration_method_check;

update goods_services set administration_method = 'sc' where administration_method = 'injectable';

alter table goods_services add constraint goods_services_administration_method_check
    check (administration_method in ('dispense', 'sc', 'im'));
