-- Migration 086: hospitalizations.ai_summary
--
-- An AI-drafted, client-facing narrative summarizing the whole
-- hospitalization stay so far (see generateHospitalizationReport in
-- lib/anthropicClient.js) — same idea as visits.ai_summary for a
-- consult, generated/regenerated from the Reports section and folded
-- into the existing Summary PDF (see lib/hospitalizationSummaryPdf.js).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table hospitalizations add column if not exists ai_summary text;
