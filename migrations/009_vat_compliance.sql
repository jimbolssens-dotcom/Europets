-- 009_vat_compliance.sql
-- UAE FTA VAT compliance for invoices: the clinic's own TRN/identity
-- (needed on every tax invoice), sequential FTA-compliant invoice
-- numbering, and an optional TRN for clients who are themselves
-- VAT-registered businesses (rather than individual pet owners).

-- Singleton settings row (id can only ever be `true`) — edited from the
-- app's Settings page rather than hardcoded, since a TRN/address can change
-- and shouldn't require a code deploy to update.
create table clinic_settings (
    id boolean primary key default true check (id),
    legal_name text not null default 'Europets Veterinary Clinic',
    trn text,
    address text,
    phone text,
    email text,
    updated_at timestamptz default now()
);
insert into clinic_settings (id) values (true) on conflict do nothing;

alter table clinic_settings disable row level security;
alter publication supabase_realtime add table clinic_settings;

-- Existing invoices are backfilled with sequential numbers automatically.
alter table invoices add column if not exists invoice_number bigint generated always as identity unique;

alter table clients add column if not exists trn text;
