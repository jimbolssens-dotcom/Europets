-- migrations/043_invoice_payments_disable_rls.sql
-- Supabase auto-enables RLS on newly created tables — invoice_payments
-- (migration 041) never got the explicit "disable row level security"
-- migrations 001-040's tables all got in schema.sql, so every insert was
-- rejected with "new row violates row-level security policy". This app
-- has no staff auth yet and talks to Supabase with the publishable key
-- (see schema.sql's ROW LEVEL SECURITY section) — consistent with every
-- other table, RLS stays off here too until real staff auth exists.

alter table invoice_payments disable row level security;
