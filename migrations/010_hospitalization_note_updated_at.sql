-- 010_hospitalization_note_updated_at.sql
-- Tracks when a worksheet entry was last edited, separate from
-- created_at, so multiple touches on the same entry through the day are
-- visible (not just when it was first written).

alter table hospitalization_notes add column if not exists updated_at timestamptz default now();
