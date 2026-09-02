-- Migration 027: recordings.extracted_fields — holds the structured
-- fields (appetite/weight/temperature/condition/notes + matched catalog
-- items) a hospitalization worksheet recording gets broken down into.
--
-- Unlike a consult recording (which writes straight onto the visit row,
-- since the visit already exists), a hospitalization worksheet entry
-- doesn't exist yet at recording time — "Add Worksheet Entry" is an
-- unsaved draft form the vet fills in and submits once. So the webhook
-- has nowhere to write the extraction to except the recording itself;
-- the hospitalization page reads it back and fills in the still-empty
-- boxes of that draft form, the same way dictating into a Vitals & Exam
-- field does for a consult, but client-side instead of via a DB write.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

alter table recordings add column if not exists extracted_fields jsonb;
