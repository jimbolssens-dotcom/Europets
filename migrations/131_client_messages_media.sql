-- Migration 131: photos on a client_messages row
--
-- A WhatsApp image message (see app/api/whatsapp/webhook) is downloaded
-- from Meta's Media API and re-hosted in the existing "consult-files"
-- Storage bucket (same one every other photo/file in this app already
-- lives in) — media_url is that public URL, media_type distinguishes
-- what it is for future non-image media (currently only 'image' is
-- populated; other message types still fall back to a plain text body).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_messages add column if not exists media_url text;
alter table client_messages add column if not exists media_type text;
