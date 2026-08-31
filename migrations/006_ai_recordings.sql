-- 006_ai_recordings.sql
-- Ambient audio capture for consults and surgeries: record in the browser,
-- upload to the existing "consult-files" bucket, transcribe via AssemblyAI,
-- summarize via Claude, and fold the summary into consult notes / the
-- surgical report it belongs to.

create table recordings (
    id uuid primary key default gen_random_uuid(),
    entity_type text not null,       -- 'visit' (consult) or 'surgical_report'
    entity_id uuid not null,
    file_path text not null,         -- path within the consult-files bucket
    file_name text,
    status text not null default 'processing',  -- 'processing', 'done', 'error'
    transcript text,
    summary text,
    error_message text,
    assemblyai_transcript_id text,
    created_at timestamptz default now()
);

create index idx_recordings_entity on recordings(entity_type, entity_id);

alter table recordings disable row level security;
alter publication supabase_realtime add table recordings;

-- Surgical reports don't have their own notes thread the way consults do
-- (via consult_notes) — give them a dedicated field for the AI summary so
-- it's kept separate from the surgeon's own free-text notes.
alter table surgical_reports add column if not exists ai_summary text;
