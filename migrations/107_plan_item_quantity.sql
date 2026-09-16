-- Migration 107: quantity on Day Treatment Plan items
--
-- Every tap of a catalog-linked plan item has logged exactly 1 unit of
-- that catalog item so far — fine for a whole tablet or a flat-fee
-- service, wrong for an injectable dosed by the mL, where staff often
-- give less than a full unit (e.g. 0.5ml). Lets a plan item declare the
-- quantity each tap should log instead of always assuming 1 — carried
-- through to the treatment_item created on tap (see logTask/logVitals in
-- DayTreatmentPlan.jsx, ProcedureChecklist.jsx, WallCageTile.jsx), which
-- is what actually reaches the invoice line total (quantity × unit price
-- — see lib/invoicing.js), so this also fixes those getting billed for a
-- full unit when only a fraction was actually given.
--
-- Existing plan items default to 1, i.e. unchanged behavior.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalization_plan_items
  add column if not exists quantity numeric(10,2) not null default 1
  check (quantity > 0);
