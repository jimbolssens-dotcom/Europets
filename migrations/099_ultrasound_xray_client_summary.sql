-- Migration 099: separate client-facing summary for ultrasound/x-ray reports
--
-- ultrasound_reports.ai_summary and xray_reports.ai_summary used to hold a
-- single AI-elaborated report written directly in plain, owner-facing
-- language. That's now the formal clinical report instead — proper
-- veterinary radiology terminology, FINDINGS/IMPRESSION sections, for the
-- permanent medical record (see generateUltrasoundReport/generateXrayReport
-- in lib/anthropicClient.js) — with a second AI pass
-- (generateClientSummaryFromScanReport) translating THAT report into plain
-- language for the owner, stored here.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table ultrasound_reports add column if not exists client_summary text;
alter table xray_reports add column if not exists client_summary text;
