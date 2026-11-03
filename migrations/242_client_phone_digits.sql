-- Migration 242: digits-only copy of each client phone number
--
-- Finding "which client has this number" (the search box, every incoming
-- WhatsApp message, the client app login, invoice search) used to download
-- every client_phones row (~14,000, in pages of 1,000) and compare digits
-- in the server, because numbers are stored as typed ("050 123 4567",
-- "+971501234567", ...). With a digits-only column the database does the
-- match and returns only the matching rows (lib/phoneMatch.js).
--
-- A generated column: Postgres keeps it in step with `phone` by itself.
-- Adds a column only; nothing is changed or deleted. Safe to run again.

alter table client_phones
  add column if not exists phone_digits text
  generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored;
