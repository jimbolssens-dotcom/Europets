-- Migration 185: catalog items charged once per time they're given
--
-- Some items are a flat charge each time, whatever amount the worksheet
-- logs: subcutaneous fluids (AED 80 a session, 150 ml or 50 ml) and a
-- force-feed (AED 30 a feed). Staff log the ml given as the quantity, and
-- the invoice multiplied the price by it, so a 150 ml session billed as
-- 150 sessions. With charge_per_occasion, each worksheet entry counts as
-- one charge (see lib/invoicing.js billedAmount).
--
-- Safe to run more than once.

alter table goods_services add column if not exists charge_per_occasion boolean not null default false;

update goods_services set charge_per_occasion = true
where name in ('Sustain HDN Force Feed (per feed)', 'Subcutanous fluids') and not charge_per_occasion;
