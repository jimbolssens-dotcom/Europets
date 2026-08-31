-- Migration 001: add human-facing client_number and patient_number.
-- Run this in your Supabase SQL editor if your database was created
-- before this migration was added to schema.sql (existing rows are
-- backfilled with sequential numbers automatically).

alter table clients add column client_number bigint generated always as identity unique;
alter table patients add column patient_number bigint generated always as identity unique;
