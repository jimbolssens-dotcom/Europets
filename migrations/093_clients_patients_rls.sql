-- migrations/093_clients_patients_rls.sql
-- Turns Row Level Security back on for the three tables holding real
-- client/pet PII (clients, client_phones, patients) — migrations/
-- 003_disable_rls.sql turned it off everywhere for this app's whole
-- lifetime so far. Every other table is unaffected and stays as-is.
--
-- The policy below keeps reads exactly as open as they've always been —
-- the app's own publishable key (used by every API route's reads and by
-- client-side realtime subscriptions) has no per-user login to scope
-- reads to, so it still gets an unconditional SELECT. Only writes change:
-- nothing but the service-role key can insert, update, or delete a row in
-- these three tables now. Postgres/Supabase's service_role already
-- bypasses RLS entirely by default, so it needs no policy of its own here
-- — see lib/supabaseAdmin.js for the server-only client using it, and set
-- SUPABASE_SERVICE_ROLE_KEY (from the Supabase project's Settings -> API
-- page) as its env var.
--
-- IMPORTANT deploy order: deploy the code that uses supabaseAdmin for
-- these tables' writes (and the SUPABASE_SERVICE_ROLE_KEY env var) FIRST,
-- THEN run this migration. Running this first would make every client/
-- patient write in production fail (add/edit a client, add/edit a
-- patient, the intake-approval flow, ...) until the new code is live.

alter table clients enable row level security;
alter table client_phones enable row level security;
alter table patients enable row level security;

create policy "clients_public_read" on clients for select using (true);
create policy "client_phones_public_read" on client_phones for select using (true);
create policy "patients_public_read" on patients for select using (true);
