-- Migration 096: let a treatment plan item be logged without charging it
--
-- A vet sometimes wants to log something on the consult's treatment plan
-- purely as a clinical record (e.g. "give this flea treatment" when the
-- owner already has it at home) without it turning into an invoice
-- charge once the consult is invoiced (see lib/invoicing.js). Defaults to
-- true so every existing row, and anything that doesn't pass the new
-- field, keeps billing exactly as before.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table treatment_items add column if not exists billable boolean not null default true;
