-- Migration 015: let a client optionally give their Emirates ID number on
-- the public intake form.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

alter table intake_requests add column emirates_id text;
