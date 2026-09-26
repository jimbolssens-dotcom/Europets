-- Migration 148: one-time login codes for staff, delivered over WhatsApp
-- to the clinic's own number (see lib/staffAuth.js, app/api/login/*)
--
-- Same shape as client_otp_codes (migration 128), minus a phone column —
-- there's only ever the one destination (STAFF_LOGIN_OTP_PHONE), so
-- nothing to key rows on beyond recency. Off by default: this table sits
-- unused until STAFF_LOGIN_OTP_ENABLED="true" is set (see
-- lib/staffAuth.js's isStaffOtpEnabled), which is a deliberate separate
-- step from running this migration.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists staff_otp_codes (
    id uuid primary key default gen_random_uuid(),
    code_hash text not null,
    expires_at timestamptz not null,
    attempts int not null default 0,
    consumed_at timestamptz,
    created_at timestamptz default now()
);

create index if not exists staff_otp_codes_created_at_idx
    on staff_otp_codes (created_at desc);

alter table staff_otp_codes disable row level security;
