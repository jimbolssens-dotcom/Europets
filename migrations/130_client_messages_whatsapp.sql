-- Migration 130: WhatsApp as a second channel into the existing client_messages inbox
--
-- Extends client_messages (migration 120, the client app's own chat) to
-- also carry WhatsApp conversations, so staff read and reply to both from
-- the same /messages inbox instead of a separate screen, and any future
-- AI/staff-coaching work over this conversation history has one log
-- instead of two. channel defaults to 'app' so every existing row keeps
-- its current meaning untouched — no backfill needed for them.
--
-- client_id becomes optional: a WhatsApp message can arrive from a number
-- that isn't linked to any client yet (a new inquiry, a wrong number).
-- phone carries the raw WhatsApp number for that case, so the thread is
-- still readable/repliable before (or without) ever being linked to a
-- client record — null for 'app' rows, which are already scoped to a
-- client by definition. wa_message_id/status track an outbound WhatsApp
-- message's delivery state (sent/delivered/read/failed), fed by Meta's
-- status webhooks — meaningless for 'app' rows, left null there.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_messages alter column client_id drop not null;

alter table client_messages add column if not exists channel text not null default 'app' check (channel in ('app', 'whatsapp'));
alter table client_messages add column if not exists phone text;
alter table client_messages add column if not exists wa_message_id text unique;
alter table client_messages add column if not exists status text check (status in ('sent', 'delivered', 'read', 'failed'));

create index if not exists client_messages_phone_idx on client_messages (phone) where phone is not null;
