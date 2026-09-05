-- Migration 054: hospitalization update request message
--
-- Lets a client add a short note (e.g. "is she eating yet?") when they tap
-- "Request an Update" on the portal page, instead of just a bare flag.
-- Cleared alongside update_requested_at, either automatically (a new
-- worksheet entry) or manually (staff dismiss it) — see
-- app/api/hospitalizations/[id]/notes/route.js and
-- app/(admin)/hospitalization/[id]/page.jsx's dismissUpdateRequest.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalizations add column if not exists update_request_message text;
