-- 260: which clients used the client app on which day (Jim, 21 Nov), so the
-- Client app chart can show daily / weekly / monthly active users, not just
-- logins. One row per client per day (UAE date), with how many times they
-- opened the app that day. Written by POST /api/clients/:id/app-seen,
-- which the app already pings on every page load (staff testing it don't
-- count). Only the server reads or writes it (RLS on, no policies).
--
-- History before today isn't known; each client's last-seen day is added
-- once so the chart doesn't start empty. Safe to re-run.

create table if not exists public.client_app_days (
  client_id uuid not null references public.clients(id) on delete cascade,
  day date not null,
  opens integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (client_id, day)
);
alter table public.client_app_days enable row level security;
create index if not exists client_app_days_day_idx on public.client_app_days (day);

create or replace function public.touch_client_app_day(p_client uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into client_app_days (client_id, day)
  values (p_client, (now() at time zone 'Asia/Dubai')::date)
  on conflict (client_id, day) do update
    set opens = client_app_days.opens + 1, last_at = now();
$$;
revoke all on function public.touch_client_app_day(uuid) from public, anon, authenticated;

insert into public.client_app_days (client_id, day, first_at, last_at)
select id, (client_app_last_seen_at at time zone 'Asia/Dubai')::date, client_app_last_seen_at, client_app_last_seen_at
from public.clients
where client_app_last_seen_at is not null
on conflict (client_id, day) do nothing;
