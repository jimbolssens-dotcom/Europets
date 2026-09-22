-- Migration 133: cap vaccination reminders instead of nagging forever
--
-- reminder_sent_at alone (migration 011) could only say "reminded at some
-- point" — not how many times, so nothing stopped the same badly-overdue
-- vaccine from being reminded again and again indefinitely, which is both
-- pointless for a client who's clearly not coming back for that dose and
-- a real risk to the WhatsApp number's own quality rating with Meta if a
-- client starts ignoring/blocking repeated pings. reminder_count tracks
-- how many reminders have actually gone out for the CURRENT
-- next_due_date, so the app can enforce a cooldown between sends and a
-- hard cap, after which it's treated as lapsed — a human's call to make,
-- not another automatic nudge (see app/api/vaccinations/send-reminder and
-- app/(admin)/vaccinations).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table vaccinations add column if not exists reminder_count integer not null default 0;
