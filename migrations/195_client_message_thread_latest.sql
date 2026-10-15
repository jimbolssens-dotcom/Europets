-- 195: the inbox summary (GET /api/client-messages) used to read every
-- message and keep the newest per thread, but a request returns at most
-- 1000 rows, so once there were more than 1000 messages any thread whose
-- latest message was older than the 1000th newest silently vanished from
-- the Messages list (14 threads on 15 Oct 2026). This returns exactly one
-- row per thread instead: its newest message that isn't an automatic
-- notice (migration 194). Safe to re-run.
create or replace function public.client_message_thread_latest()
 returns table(id uuid, client_id uuid, phone text, channel text, sender text, body text, media_type text, created_at timestamptz)
 language sql
 stable
 set search_path to 'public'
as $function$
  select distinct on (coalesce(m.client_id::text, 'phone:' || m.phone))
    m.id, m.client_id, m.phone, m.channel, m.sender, m.body, m.media_type, m.created_at
  from client_messages m
  where not m.is_notice
  order by coalesce(m.client_id::text, 'phone:' || m.phone), m.created_at desc
$function$;

-- Server only (the app reads it with the service role).
revoke execute on function public.client_message_thread_latest() from public, anon, authenticated;
