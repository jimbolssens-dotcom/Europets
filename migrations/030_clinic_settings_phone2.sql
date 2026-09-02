-- Migration 030: a second landline number for the clinic (Settings ->
-- Clinic Information), alongside the existing `phone`.
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table clinic_settings add column if not exists phone2 text;
