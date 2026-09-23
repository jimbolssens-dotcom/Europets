-- Migration 140: track read/flagged state per conversation
--
-- The Messages inbox's 🔔 "needs attention" alarm (app/api/client-messages)
-- was purely derived — pending whenever the conversation's last message
-- came from the client — with no concept of "staff has actually looked at
-- this" at all. Opening a thread and closing it again without replying
-- left the alarm on forever, since nothing recorded that it had been seen.
--
-- thread_key matches the same computed key the app already uses in
-- memory for a conversation (client_id when linked, `phone:<number>` for
-- an unmatched WhatsApp number) — plain text, not a foreign key, since it
-- has to hold either shape.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists client_message_thread_state (
    thread_key text primary key,
    last_read_at timestamptz,
    flagged boolean not null default false,
    updated_at timestamptz default now()
);

-- Same pattern as every other table (migrations/093, 103) — open read
-- (the app's real authorization lives in the API route layer, not
-- Postgres), writes only via the service-role client. Created with RLS
-- enabled from day one rather than needing a later cleanup migration.
alter table client_message_thread_state enable row level security;
create policy "client_message_thread_state_public_read" on client_message_thread_state for select using (true);

