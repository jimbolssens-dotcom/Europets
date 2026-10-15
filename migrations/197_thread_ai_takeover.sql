-- 197: staff hand a WhatsApp conversation to the AI ("🤖 AI take over").
-- While ai_takeover_at is set and no member of staff has written since,
-- the AI concierge answers every client message itself, even though staff
-- were in the thread or it had been handed over. A staff message ends it;
-- so does the AI handing the thread back (flagEscalatedThread clears it).
-- Safe to re-run.
alter table public.client_message_thread_state add column if not exists ai_takeover_at timestamptz;
