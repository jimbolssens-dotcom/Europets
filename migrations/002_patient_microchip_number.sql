-- Migration 002: add microchip_number to patients.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

alter table patients add column microchip_number text unique;
