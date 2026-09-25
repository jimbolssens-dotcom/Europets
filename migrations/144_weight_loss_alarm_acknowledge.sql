-- Migration 144: acknowledge the rapid-weight-loss alarm
--
-- lib/weightLossAlarm.js's alarm (migration-free, purely computed from
-- hospitalization_notes.weight_kg) had no way to silence it once staff had
-- actually seen and attended to it — it only ever cleared itself once the
-- underlying trend stopped holding, which could be days later. This column
-- is the acknowledgment: set to the most recent weight reading's own
-- created_at at the moment staff dismiss it (see PATCH
-- /api/hospitalizations/:id's acknowledge_weight_loss_alarm), so the alarm
-- stays quiet only as long as that stays the newest reading — the moment a
-- fresh weight is logged, that's new information nobody's acknowledged
-- yet, and the alarm re-evaluates against it.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalizations add column if not exists weight_loss_ack_reading_at timestamptz;
