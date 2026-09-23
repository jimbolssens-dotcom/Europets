-- Migration 135: disambiguate the duplicate "Biocan R" catalog entries
--
-- Two goods_services rows share the exact name "Biocan R": the one
-- migration 094 added specifically for vaccine-visit billing (base_price
-- 45, administration_method NULL — its price already includes the
-- injection fee) and an older, separate stock item (base_price 30,
-- administration_method 'sc', which adds the SC injection fee on top).
-- useVaccinations.js's RABIES_VACCINE_NAME matches by exact name only, so
-- with two identical names which one it finds is effectively arbitrary —
-- this is very likely why a rabies dose's charge silently never made it
-- onto a Primary Booster invoice (see app/_components/useVaccinations.js's
-- addInvoiceLine/addTreatmentItem, which as of this same session now at
-- least surface a request failure instead of swallowing it).
--
-- Renames the 'sc' one (NOT the one billing relies on — that name has to
-- stay exactly "Biocan R") and deactivates it. Deactivating alone
-- wouldn't have been enough on its own: the billing lookup doesn't filter
-- by active status, so the rename is what actually fixes the ambiguity.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

update goods_services
set name = 'Biocan R (SC injection, legacy)', active = false
where name = 'Biocan R' and administration_method = 'sc';
