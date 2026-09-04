-- Migration 045: hospitalization update requests
--
-- Lets a client tap "Request an Update" on their hospitalization portal
-- page (app/portal/hospitalization/[id]) to flag that they're waiting to
-- hear from staff. update_requested_at is null normally; set to the
-- request time by POST /api/hospitalizations/:id/request-update, and
-- cleared back to null either automatically (the moment staff log a new
-- worksheet entry — see app/api/hospitalizations/[id]/notes/route.js) or
-- manually from the admission's staff page. The Cage Layout page (desktop
-- and mobile) reads this to make that cage blink until it's cleared.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalizations add column if not exists update_requested_at timestamptz;
