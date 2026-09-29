-- Migration 160: track and find WhatsApp threads nobody's answered in time
--
-- The real-time concierge (lib/whatsappConcierge.js) already covers most
-- inbound WhatsApp messages within seconds — a normal AI reply, an
-- escalation notice, or (as of the previous fix) a staff-handoff notice.
-- But several cases never reach it at all and, until now, could sit
-- completely silent forever unless a human happened to notice:
--   - a WhatsApp number that isn't matched to any client
--   - a photo/voice note/document (always needs a human's eyes, never
--     routed to the concierge)
--   - WHATSAPP_AI_ENABLED turned off entirely
--   - a rare concierge failure (model error, empty reply)
--
-- nudge_sent_at tracks the last time the automated sweep (see
-- lib/whatsappUnanswered.js, app/api/whatsapp/nudge-sweep) sent something
-- for the CURRENT unanswered stretch on a thread — compared against that
-- thread's latest client message so a new message after a nudge always
-- gets its own fresh one, but a thread doesn't get re-nudged every time
-- the sweep runs while still waiting on the same message.
--
-- whatsapp_threads_needing_nudge() does the actual "who's overdue" lookup
-- in SQL rather than pulling every client_messages row into the app —
-- same reasoning as list_public_tables()/next_payment_sequence() earlier:
-- this is naturally a set-based question one query answers directly.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_message_thread_state add column if not exists nudge_sent_at timestamptz;

create or replace function whatsapp_threads_needing_nudge(cutoff_minutes integer default 5)
returns table (
    thread_key text,
    client_id uuid,
    phone text,
    body text,
    media_type text,
    last_message_at timestamptz
)
language sql
stable
as $$
  with latest as (
    select distinct on (coalesce(client_id::text, 'phone:' || phone))
      coalesce(client_id::text, 'phone:' || phone) as thread_key,
      client_id, phone, sender, body, media_type, created_at
    from client_messages
    where channel = 'whatsapp' and phone is not null
    order by coalesce(client_id::text, 'phone:' || phone), created_at desc
  )
  select l.thread_key, l.client_id, l.phone, l.body, l.media_type, l.created_at
  from latest l
  left join client_message_thread_state s on s.thread_key = l.thread_key
  where l.sender = 'client'
    and l.created_at < now() - make_interval(mins => cutoff_minutes)
    and (s.nudge_sent_at is null or s.nudge_sent_at < l.created_at)
$$;
