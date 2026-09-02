-- Migration 018: let treatment items (medications, goods/services, tests)
-- and invoices attach to a hospitalization admission directly, not just a
-- consult visit — so day-to-day charges during a stay can be logged and
-- then consolidated into one invoice at discharge.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

alter table treatment_items alter column visit_id drop not null;
alter table treatment_items add column hospitalization_id uuid references hospitalizations(id) on delete cascade;

alter table invoices add column hospitalization_id uuid references hospitalizations(id);
