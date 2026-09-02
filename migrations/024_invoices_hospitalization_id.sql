-- Migration 024: add invoices.hospitalization_id for databases that
-- applied migration 019 (worksheet items) but never applied the
-- invoices-side change from migration 018 — "Create Invoice from
-- Worksheet" on a hospitalization fails with "Could not find the
-- 'hospitalization_id' column of 'invoices'" without this.
-- Safe to run even if migration 018 was already applied (if_not_exists).
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

alter table invoices add column if not exists hospitalization_id uuid
    references hospitalizations(id);
