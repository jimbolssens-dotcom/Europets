-- Migration 056: drop clients.phone2 / phone2_label
--
-- Run this only after 055_client_phones.sql has been run and you've
-- confirmed the backfill looks right (client_phones has a row for every
-- client who had a phone or phone2) — every place that used to read
-- phone2 directly now reads client_phones instead.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table clients drop column if exists phone2;
alter table clients drop column if exists phone2_label;
