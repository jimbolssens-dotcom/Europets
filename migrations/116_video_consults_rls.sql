-- Migration 116: fix video_consults — missing RLS read policy
--
-- migration 115 created video_consults without enabling Row Level Security,
-- which in this project means the anon key (used by every ordinary read in
-- this app — see lib/supabaseClient.js) has NO access to it at all, not
-- full access: reads always come back empty, silently. That's why the
-- video-consult route's own "does a room already exist for this visit?"
-- check never found the room it had already created, and both the staff
-- consult page and the client's portal join page could never see it either.
-- Same fix, same pattern as every other table (see migration 103): RLS on,
-- reads open to everyone (this app has no per-user Postgres login to scope
-- them to), writes left with no policy at all so only the service-role key
-- (supabaseAdmin) can insert/update.

alter table video_consults enable row level security;
create policy "video_consults_public_read" on video_consults for select using (true);
