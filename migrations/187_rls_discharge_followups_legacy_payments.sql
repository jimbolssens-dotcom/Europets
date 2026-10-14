-- Migration 187: close the two tables Supabase flagged as publicly writable
--
-- Supabase's security advisor (email "Action required: security
-- vulnerabilities detected", 14 Oct) flagged discharge_followups and
-- legacy_payments: RLS was off, so anyone holding the project URL and the
-- public anon key (it ships in the browser bundle) could read, change or
-- delete every row.
--
--   legacy_payments      old-system payments with client names and amounts.
--                        RLS on, no policy: server-only. The app's routes
--                        read it with the service role (supabaseAdmin).
--   discharge_followups  RLS on with a public read policy, like the other
--                        clinical tables (the Follow-ups page refreshes from
--                        it in realtime). Writes stay server-only.
--
-- Also pins search_path on the functions the advisor warned about.
--
-- Safe to run more than once.

alter table legacy_payments enable row level security;
alter table discharge_followups enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'discharge_followups' and policyname = 'discharge_followups_public_read'
  ) then
    execute 'create policy "discharge_followups_public_read" on discharge_followups for select using (true)';
  end if;
end $$;

alter function public.next_payment_sequence(text) set search_path = public;
alter function public.list_public_tables() set search_path = public;
alter function public.whatsapp_threads_needing_nudge(integer) set search_path = public;
alter function public.attachments_pending_compression(integer) set search_path = public;
alter function public.cattery_daily_logs_fill_patient() set search_path = public;
