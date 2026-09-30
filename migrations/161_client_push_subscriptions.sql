-- Migration 161: Web Push subscriptions for the client app
--
-- Lets a client who's installed the client portal (Add to Home Screen /
-- desktop "Install app" — public/client-app-manifest.json, already
-- possible before this migration) opt into real push notifications, not
-- just whatever they happen to see next time they open the app.
--
-- One row per browser/device a client has opted in from (a phone and a
-- desktop count separately) — endpoint is the browser's own unique push
-- URL, so it doubles as the natural de-dupe key. p256dh/auth are the two
-- keys the Push API hands back alongside it, both required to encrypt a
-- push payload for that specific subscription (see lib/pushNotifications.js).
--
-- Same pattern as client_otp_codes (migration 128): RLS on, zero
-- policies. Nothing ever reads or writes this table except
-- app/api/client-app/push/* (via getClientSession, so a client can only
-- ever touch their own rows) and lib/pushNotifications.js, both
-- exclusively through supabaseAdmin — no anon access serves any purpose
-- here, and this is more sensitive than most tables to leave open: a
-- leaked subscription lets whoever holds it push arbitrary notifications
-- to that specific browser.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists client_push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade not null,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz default now()
);

create index if not exists client_push_subscriptions_client_id_idx
    on client_push_subscriptions (client_id);

alter table client_push_subscriptions enable row level security;
