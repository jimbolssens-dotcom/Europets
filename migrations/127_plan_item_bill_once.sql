-- Migration 127: "charge once" Day Treatment Plan items
--
-- A plan item marked bill_once (e.g. eye drops, a topical gel) can still be
-- tapped/logged as many times as it's actually done — every tap still shows
-- up in the Day-to-day Worksheet as a normal clinical record — but only the
-- FIRST logged occurrence for the whole stay adds a charge to the invoice.
-- Every later tap of the same plan item creates its treatment_item with
-- billable = false (see lib/planItemBilling.js), the same flag already used
-- for a deliberately non-billable item (migration 096) — no new invoicing
-- logic needed, just deciding when to set it.
--
-- Existing plan items default to false (bill every logged dose, unchanged
-- behavior).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalization_plan_items
  add column if not exists bill_once boolean not null default false;
