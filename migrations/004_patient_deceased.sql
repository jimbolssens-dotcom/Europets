-- Migration 004: add deceased flag to patients.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

alter table patients add column deceased boolean not null default false;
