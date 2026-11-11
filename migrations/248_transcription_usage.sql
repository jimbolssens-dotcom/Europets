-- Migration 248: transcription usage log (Jim, 11 Nov)
--
-- One row per finished AssemblyAI transcription: how long the audio was and
-- whether Veterinary Mode (domain 'veterinary-v1') was on, so the cost of
-- Vet Mode can be worked out from real use. Recordings themselves are
-- deleted once processed, so their lengths aren't kept anywhere else.
-- Written by lib/assemblyai.js with the service role only.
-- Adds a table. Safe to run more than once.

create table if not exists transcription_usage (
  id uuid primary key default gen_random_uuid(),
  transcript_id text not null unique,
  audio_seconds numeric,
  domain text,
  speech_model text,
  speaker_labels boolean,
  language_detection boolean,
  created_at timestamptz not null default now()
);

create index if not exists transcription_usage_created_idx on transcription_usage (created_at);

alter table transcription_usage enable row level security;
revoke all on transcription_usage from anon, authenticated;
