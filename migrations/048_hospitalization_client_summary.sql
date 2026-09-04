-- Migration 048: editable client-facing summary text on hospitalization_notes
--
-- Staff could only see icon chips for a Quick Check-In entry (cleaner/fast
-- mobile form — see lib/hospitalizationCheckin.js), not the actual prose
-- the client portal shows the owner, and had no way to correct that
-- wording. This column stores that exact text: generated once at
-- creation from the check-in's structured fields (buildEmpathicCheckinText),
-- then editable by staff on the desktop worksheet — the portal renders
-- this stored value instead of recomputing it, so an edit actually
-- changes what the owner sees.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalization_notes add column if not exists client_summary text;
