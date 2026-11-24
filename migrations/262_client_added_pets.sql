-- 262: a client can add a pet themselves in the client app (Jim, 24 Nov).
-- It goes on file straight away; added_by_client_at marks it so staff see
-- "Added by the client" on its page and can check the details at the first
-- visit, then mark it checked (client_details_checked_at). Adds columns
-- only. Safe to re-run.
alter table public.patients add column if not exists added_by_client_at timestamptz;
alter table public.patients add column if not exists client_details_checked_at timestamptz;
