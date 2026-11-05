-- Migration 243: close what Supabase's security advisor flagged (5 Nov)
--
-- Six tables had row-level security off, so anyone with the project URL
-- and the public (anon) key could read, change or delete them through the
-- API; health_certificates also holds owners' personal details. The app's
-- server code uses the service role key (lib/supabaseClient.js), which RLS
-- doesn't apply to, so turning it on changes nothing for the app. The one
-- browser use, the roster's live updates on
-- staff_roster_no_shift_confirmations (MobileRosterGate), gets the same
-- staff-only read policy as staff_roster_entries.
--
-- Also: the stock_levels view runs with the caller's permissions, the
-- stock sync trigger functions can't be called directly through the API,
-- and the duplicate-payment guard's search_path is pinned.
--
-- Nothing is deleted or rewritten. Safe to run more than once.

alter table if exists public.staff_roster_no_shift_confirmations enable row level security;
alter table if exists public.stock_items enable row level security;
alter table if exists public.stock_links enable row level security;
alter table if exists public.stock_vaccine_links enable row level security;
alter table if exists public.stock_movements enable row level security;
alter table if exists public.health_certificates enable row level security;

drop policy if exists staff_roster_no_shift_confirmations_staff_read on public.staff_roster_no_shift_confirmations;
create policy staff_roster_no_shift_confirmations_staff_read
  on public.staff_roster_no_shift_confirmations
  for select to authenticated
  using (is_staff_jwt());

alter view if exists public.stock_levels set (security_invoker = true);

revoke execute on function public.stock_sync_invoice_line() from anon, authenticated, public;
revoke execute on function public.stock_sync_treatment_item() from anon, authenticated, public;
revoke execute on function public.stock_sync_vaccination() from anon, authenticated, public;

alter function public.skip_duplicate_payment_link() set search_path = public;
