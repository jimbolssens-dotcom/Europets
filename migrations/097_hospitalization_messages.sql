-- Migration 097: two-way chat thread on a hospitalization
--
-- Replaces the one-shot "owner asked a question" model (hospitalizations.
-- update_requested_at / update_request_message, still used as the "needs
-- attention" flag everywhere else — Cage Layout, the wall display, nav
-- badges) with an actual message thread staff can reply into directly,
-- instead of only being able to log a clinical worksheet entry.
--
-- The client's side of the conversation still goes through POST
-- /api/hospitalizations/:id/request-update (now also inserting a 'client'
-- row here); staff replies through the new POST .../messages (staff-only,
-- gated by the normal staff PIN — this table has no RLS of its own,
-- same as hospitalization_notes, so the trust boundary is the API route,
-- not the database).
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists hospitalization_messages (
    id uuid primary key default gen_random_uuid(),
    hospitalization_id uuid references hospitalizations(id) on delete cascade not null,
    sender text not null check (sender in ('client', 'staff')),
    staff_id uuid references staff(id),   -- set when sender = 'staff'; null for a client message
    body text not null,
    created_at timestamptz default now()
);

create index if not exists hospitalization_messages_hospitalization_id_idx
    on hospitalization_messages (hospitalization_id, created_at);

alter table hospitalization_messages disable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hospitalization_messages'
  ) then
    execute 'alter publication supabase_realtime add table hospitalization_messages';
  end if;
end $$;
