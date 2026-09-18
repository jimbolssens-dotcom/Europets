-- Migration 128: one-time login codes for the client app (see
-- lib/clientAppAuth.js, app/api/client-app/auth/*)
--
-- Replaces "type a phone number on file, no verification" with a real
-- WhatsApp-delivered code. Keyed by phone digits, not client_id, since a
-- request-code call happens before we've committed to which client record
-- (a phone can be shared across more than one client) — verify-code does
-- that lookup itself once the code checks out.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists client_otp_codes (
    id uuid primary key default gen_random_uuid(),
    phone text not null,
    code_hash text not null,
    expires_at timestamptz not null,
    attempts int not null default 0,
    consumed_at timestamptz,
    created_at timestamptz default now()
);

create index if not exists client_otp_codes_phone_idx
    on client_otp_codes (phone, created_at desc);

alter table client_otp_codes disable row level security;
