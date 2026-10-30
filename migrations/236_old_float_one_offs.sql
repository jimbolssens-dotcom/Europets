-- Migration 236: one-off costs in the old float history
--
-- Sep 2023's outgoing (AED 533,972) includes a property purchase, a capital
-- cost rather than running the clinic. The float only has the month's
-- total, so the purchase is estimated as what went out above that VAT
-- year's usual month (the other eleven averaged AED 160,286): AED 373,686.
-- The History page (lib/floatHistory.js) leaves one_off_costs out of the
-- month's outgoing and net profit so months compare like for like, and
-- says so. The month's own figures stay as the float had them.
--
-- Safe to run more than once.

alter table old_float_months add column if not exists one_off_costs numeric(12,2);
alter table old_float_months add column if not exists one_off_note text;

update old_float_months
set one_off_costs = 373686,
    one_off_note = 'Property purchase (estimated: outgoing above the year''s usual month)'
where month = '2023-09-01';
