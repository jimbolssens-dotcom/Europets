-- Migration 159: private Storage bucket for the nightly database backup's
-- overflow path (see app/api/backups/nightly/route.js) — only used when a
-- backup ZIP is too large to attach directly to the nightly email, so a
-- signed, time-limited link is emailed instead of the file itself.
--
-- Deliberately private (public: false) with NO storage.objects policies —
-- only the nightly cron route touches this bucket, always via the
-- service-role client (supabaseAdmin), which bypasses RLS entirely
-- regardless of policies (same reasoning as migration 139's consult-files
-- lockdown). No policy means no other access route exists at all: not
-- the anon key, not a signed-in client, nothing — only a signed URL this
-- app itself generates can read a file in it.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

insert into storage.buckets (id, name, public)
values ('database-backups', 'database-backups', false)
on conflict (id) do nothing;
