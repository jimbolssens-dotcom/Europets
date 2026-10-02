-- Migration 166: 'email' as a third client_messages channel
--
-- Extends the same client_messages thread (migrations/120, 130 — already
-- 'app' and 'whatsapp') to carry real, server-sent emails too — see
-- POST /api/clients/:id/messages (channel: 'email') and lib/email.js.
-- subject is only ever set on an email-channel row; null for 'app'/
-- 'whatsapp' rows, which have no such concept.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_messages drop constraint if exists client_messages_channel_check;
alter table client_messages add constraint client_messages_channel_check check (channel in ('app', 'whatsapp', 'email'));

alter table client_messages add column if not exists subject text;
