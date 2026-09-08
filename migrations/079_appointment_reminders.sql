-- Migration 079: appointment reminder tracking
--
-- Lets staff send a WhatsApp reminder for a booked appointment (same
-- "draft a pre-filled message, staff sends it themselves" pattern as the
-- Vaccination Reminders page — there's no connected WhatsApp Business API
-- to send these on their own) and tracks when it was last sent so the
-- appointments list can show it.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table appointments add column if not exists reminder_sent_at timestamptz;
