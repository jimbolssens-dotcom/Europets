-- Migration 115: online video consults
--
-- A video consult is a regular visits row (same consult record, notes,
-- diagnostics, treatment plan as an in-person one) that never had a
-- physical room assigned — visits.room_id is already nullable at the DB
-- level (only the check-in API enforces it, relaxed below for is_video),
-- flagged by the new is_video column so the UI knows to show a video panel
-- instead of a room name.
--
-- video_consults holds the actual call: one row per visit, pointing at a
-- Daily.co room (see lib/dailyVideo.js). The room's own name/url double as
-- the unguessable-link security model already used everywhere else in this
-- app's client-facing portal pages (see app/portal/*) — no separate client
-- login. status/started_at/ended_at are set by staff action (there's no
-- webhook wiring from Daily back into this app yet), just enough to show
-- "was this call ever started" on the consult page.

alter table visits add column if not exists is_video boolean not null default false;

create table if not exists video_consults (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid references visits(id) on delete cascade not null unique,
    room_name text not null,
    room_url text not null,
    status text not null default 'scheduled',  -- 'scheduled', 'active', 'ended'
    invited_at timestamptz,   -- set when staff sends the client the join link (WhatsApp)
    started_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz default now()
);

create index if not exists video_consults_visit_idx on video_consults(visit_id);
