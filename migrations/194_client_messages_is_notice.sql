-- 194: the concierge's automatic holding notices ("Got it, I'll flag this
-- for our team...", "Still with our team on this...", etc.) are now saved
-- in the conversation so staff see everything the client was sent. They're
-- marked is_notice so a thread still reads as waiting on staff: the inbox
-- 🔔, the unanswered-message sweep below and the concierge's own "is staff
-- already in this thread" check all look past them. Safe to re-run.
alter table public.client_messages add column if not exists is_notice boolean not null default false;

create or replace function public.whatsapp_threads_needing_nudge(cutoff_minutes integer default 5)
 returns table(thread_key text, client_id uuid, phone text, body text, media_type text, last_message_at timestamp with time zone)
 language sql
 stable
 set search_path to 'public'
as $function$
  with latest as (
    select distinct on (coalesce(client_id::text, 'phone:' || phone))
      coalesce(client_id::text, 'phone:' || phone) as thread_key,
      client_id, phone, sender, body, media_type, created_at
    from client_messages
    where channel = 'whatsapp' and phone is not null and not is_notice
    order by coalesce(client_id::text, 'phone:' || phone), created_at desc
  )
  select l.thread_key, l.client_id, l.phone, l.body, l.media_type, l.created_at
  from latest l
  left join client_message_thread_state s on s.thread_key = l.thread_key
  where l.sender = 'client'
    and l.created_at < now() - make_interval(mins => cutoff_minutes)
    and (s.nudge_sent_at is null or s.nudge_sent_at < l.created_at)
$function$;
