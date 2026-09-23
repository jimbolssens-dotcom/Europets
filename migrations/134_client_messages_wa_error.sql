-- Migration 134: the actual reason a WhatsApp send failed
--
-- client_messages.status already tracks 'failed' (migration 130, fed by
-- Meta's delivery-status webhooks) but not why — a message can show as
-- sent in the UI right after sending (Meta's send API accepted the
-- request) and only fail moments later, async, once WhatsApp itself can't
-- actually deliver it (most commonly: a free-form reply sent outside the
-- 24-hour customer-service window a client's own message opens — Meta's
-- own error title for that is "Re-engagement message"). Without this,
-- that failure was invisible anywhere in the app.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_messages add column if not exists wa_error text;
