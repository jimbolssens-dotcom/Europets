-- Migration 108: active/inactive staff
--
-- Staff can't be deleted once they've got any history (an appointment, a
-- roster shift, a note they wrote) — the FK on those tables blocks it on
-- purpose, so old records keep a real name attached instead of going
-- orphaned. But that left no way to actually get someone who's left the
-- clinic off the active pick-lists (booking a vet, adding to the roster)
-- without losing their history. This adds a soft on/off switch instead,
-- same pattern as goods_services.active.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table staff add column if not exists active boolean not null default true;
