-- Migration 098: fix blank microchip numbers stored as '' instead of NULL
--
-- patients.microchip_number is `text unique` (migration 002) — a NULL
-- doesn't collide with other NULLs under a UNIQUE constraint, but an empty
-- string is a real value, so two unchipped patients both saved as ''
-- collided with each other and got rejected as duplicates. The API's PATCH
-- route (app/api/patients/[id]/route.js) previously passed an empty string
-- straight through instead of normalizing it to NULL the way POST already
-- did, so any patient edited with a blank microchip field before that fix
-- may have '' sitting in this column already. This backfills those rows;
-- the API fix stops new ones from being created.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

update patients set microchip_number = null where microchip_number = '';
