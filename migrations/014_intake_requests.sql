-- Migration 014: new-client self-service intake requests.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

create table intake_requests (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'pending',  -- pending (link sent, not filled in yet),
                                              -- submitted (filled in, awaiting staff review),
                                              -- approved, rejected
    full_name text,
    phone text,
    email text,
    address text,
    patients jsonb not null default '[]',  -- [{name, species, breed, date_of_birth, sex}], filled in by the client
    notes text,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    client_id uuid references clients(id),  -- set once approved
    created_at timestamptz default now()
);

create index idx_intake_requests_status on intake_requests(status);

alter publication supabase_realtime add table intake_requests;

alter table intake_requests disable row level security;
