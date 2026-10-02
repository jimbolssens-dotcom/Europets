-- Migration 165: assign a WhatsApp/App conversation to one staff member,
-- with a push notification to just their own phone
--
-- Lets a staff member (e.g. whoever's triaging the inbox) hand a
-- conversation off to a specific doctor/nurse instead of everyone sharing
-- one inbox with no way to say "this one's yours now" — see
-- app/(admin)/messages/[id]/page.jsx and app/mobile/messages/[id]/page.js.
--
-- assigned_staff_id lives on client_message_thread_state (migration 140),
-- the same per-conversation row that already tracks read/flagged state —
-- null means unassigned.
--
-- staff_push_subscriptions is the staff-side mirror of
-- client_push_subscriptions (migration 161) — one row per phone a staff
-- member has turned notifications on from. This app has no individual
-- staff login (one shared clinic PIN — see middleware.js), so staff_id
-- here is whoever is picked in the "Logging in as..." selector on that
-- phone (app/mobile/page.js's picker, read via useMobileStaff) — the same
-- self-identification already trusted elsewhere in this app (treatments
-- given, payments received). A push notification is a much lower-stakes
-- thing to get this from than those already are.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_message_thread_state
    add column if not exists assigned_staff_id uuid references staff(id);

create table if not exists staff_push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    staff_id uuid references staff(id) on delete cascade not null,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz default now()
);

create index if not exists staff_push_subscriptions_staff_id_idx
    on staff_push_subscriptions (staff_id);

-- Same reasoning as client_push_subscriptions: nothing reads/writes this
-- except app/api/staff/push/* and lib/pushNotifications.js, both via
-- supabaseAdmin — RLS on, zero policies.
alter table staff_push_subscriptions enable row level security;
