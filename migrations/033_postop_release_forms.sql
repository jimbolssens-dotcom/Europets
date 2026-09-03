-- 033_postop_release_forms.sql
-- AI-dictated surgical/dental reports -> owner-facing post-op release
-- forms. Adds:
--   - clinic_settings.surgical_postop_baseline / dental_postop_baseline —
--     the clinic's standard post-op care instructions per procedure type,
--     edited/approved in Settings, used as the starting point whenever AI
--     drafts a specific patient's post-op instructions.
--   - surgical_reports.postop_instructions / dental_reports.postop_instructions —
--     the vet-reviewed, owner-facing instructions for that specific
--     report, once saved (AI drafts it from the baseline + the report's
--     own notes/ai_summary, but nothing goes out until a vet edits/
--     approves and saves it — see app/(admin)/consults/[id]/page.jsx).
--   - dental_reports.ai_summary — dental reports didn't have an AI
--     summary column yet (only surgical_reports did); bringing dental
--     dictation up to parity with surgical.

alter table clinic_settings
    add column if not exists surgical_postop_baseline text,
    add column if not exists dental_postop_baseline text;

alter table surgical_reports
    add column if not exists postop_instructions text;

alter table dental_reports
    add column if not exists ai_summary text,
    add column if not exists postop_instructions text;

-- Newer Supabase projects auto-enable RLS by default on new tables, not
-- columns — these tables already had RLS disabled by earlier migrations,
-- but restating it here is cheap insurance against a Supabase project that
-- silently re-enabled it (has happened before in this project).
alter table clinic_settings disable row level security;
alter table surgical_reports disable row level security;
alter table dental_reports disable row level security;
