-- Migration 078: injectable medications choose SC vs IM when administered,
-- not fixed ahead of time on the catalog item
--
-- Until now a medication's catalog entry fixed one exact method
-- (dispense/sc/im — see migration 032) and every place it got added just
-- copied that fixed method onto the treatment_items row. That doesn't fit
-- an injectable medication that's sometimes given subcutaneously and
-- sometimes intramuscularly depending on the case — the catalog item now
-- just says "injectable" (or "dispense", unchanged), and the actual SC vs
-- IM route is chosen each time it's administered (consult treatment plan,
-- hospitalization worksheet, Day Treatment Plan). treatment_items and
-- invoice_line_items are unaffected -- they still carry the concrete
-- dispense/sc/im value that was actually used, same as before, so
-- lib/invoicing.js needs no changes.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table goods_services drop constraint if exists goods_services_administration_method_check;
alter table goods_services add constraint goods_services_administration_method_check
    check (administration_method in ('dispense', 'injectable'));

-- Existing catalog items fixed at sc or im are now just "injectable" —
-- the specific route moves to being chosen per administration instead.
update goods_services set administration_method = 'injectable' where administration_method in ('sc', 'im');

-- The Day Treatment Plan's tap-to-log buttons (migration 076) are created
-- once but tapped repeatedly — an injectable task stores its chosen route
-- here (asked once, when the task is added to the plan) rather than
-- re-asking on every tap.
alter table hospitalization_plan_items add column if not exists administration_method text
    check (administration_method in ('dispense', 'sc', 'im'));
