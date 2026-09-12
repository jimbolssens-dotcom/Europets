-- Migration 091: flag a plan item as a surgery directly, AI- or staff-set
--
-- checklistItemAction (lib/checklistItemAction.js) could only recognize a
-- checklist item as "surgery" when it was linked to a catalog item under a
-- surgical subcategory — a dictated or custom item with no catalog match
-- (e.g. "Femur Fracture Repair", "Mass Removal - Left Flank") never got
-- the "Open Surgical Report" option next to it, even though it plainly is
-- one. is_surgical lets the AI dictation extraction (lib/anthropicClient.js
-- -> extractDayPlanTasks) flag this directly from the transcript, and lets
-- staff set/correct it by hand (the checklist's Custom Item form and its
-- edit dialog) — checked first, ahead of the catalog-subcategory match.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalization_plan_items add column if not exists is_surgical boolean not null default false;
