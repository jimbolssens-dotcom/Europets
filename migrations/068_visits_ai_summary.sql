-- Client-facing consult report (see lib/anthropicClient.js#generateConsultReport),
-- generated when a consult is marked complete — mirrors surgical_reports/
-- dental_reports.ai_summary, just on visits directly since a regular
-- consult has no separate report table of its own.
alter table visits add column if not exists ai_summary text;
