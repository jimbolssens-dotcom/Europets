-- 190: groundwork for staff-only live updates, and close the last two
-- sensitive tables the website used to read with the anon key (it now
-- reads with its service key, confirmed in the API logs).

alter policy clients_public_read on public.clients using (false);
alter policy nomod_payment_links_public_read on public.nomod_payment_links using (false);

-- One cached Supabase Auth session for staff browsers' live updates
-- (lib/realtimeStaffToken.js). Service role only: no policies.
create table if not exists public.realtime_tokens (
  id text primary key,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.realtime_tokens enable row level security;

-- True for the staff realtime user's token. app_metadata can only be set
-- with the service role, so a self-signed-up user can't claim it.
create or replace function public.is_staff_jwt()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'app_role') = 'staff', false)
$$;
