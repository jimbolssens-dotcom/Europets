-- Migration 120: general client<->staff chat (not tied to a hospitalization)
--
-- Mirrors hospitalization_messages (migration 097) but for a standalone
-- conversation between a client and the clinic, surfaced in the client app
-- (app/client-app/messages) and a new staff inbox (app/(admin)/messages).
-- "Pending" (client waiting on a reply) is derived, not stored: a client is
-- pending whenever their most recent message has sender = 'client' — same
-- one-shared-flag-for-everyone model as the hospitalization thread, just
-- computed on read instead of tracked in its own column.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists client_messages (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade not null,
    sender text not null check (sender in ('client', 'staff')),
    staff_id uuid references staff(id),   -- set when sender = 'staff'; null for a client message
    body text not null,
    created_at timestamptz default now()
);

create index if not exists client_messages_client_id_idx
    on client_messages (client_id, created_at);

alter table client_messages disable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'client_messages'
  ) then
    execute 'alter publication supabase_realtime add table client_messages';
  end if;
end $$;
