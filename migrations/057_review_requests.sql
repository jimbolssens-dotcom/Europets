-- Migration 057: review/testimonial requests, sent to clients via WhatsApp
-- and filled in on the public website (no login) — moderated by staff
-- before they ever appear on the site. Mirrors the intake_requests
-- request/submission pattern (migration 014).

create table review_requests (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'pending',  -- pending (link sent, not filled in yet),
                                              -- submitted (filled in, awaiting staff review),
                                              -- approved (shown on the public site), rejected
    client_id uuid references clients(id),
    sent_to_phone text,  -- the number staff sent the link to
    rating smallint check (rating between 1 and 5),
    comment text,
    display_name text,  -- how the client wants to be shown publicly, e.g. "Sarah K." — defaults to their first name + last initial if left blank
    submitted_at timestamptz,
    reviewed_at timestamptz,
    created_at timestamptz default now()
);

create index idx_review_requests_status on review_requests(status);

alter publication supabase_realtime add table review_requests;

alter table review_requests disable row level security;
