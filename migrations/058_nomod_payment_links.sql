-- Migration 058: online bill payment via Nomod payment links.
--
-- A payment link is created lazily — when a client opens their own
-- "Settle Your Bill" page on the website (website/app/settle-bill/[id]),
-- not ahead of time by staff — so it's always for the invoice's real,
-- current balance. This table just tracks the ones created, so a repeat
-- visit reuses a still-pending link instead of creating a new one every
-- time, and so the webhook has something to match a completed payment
-- back to.
create table nomod_payment_links (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid references invoices(id) not null,
    nomod_link_id text,  -- Nomod's own id for this link — what the webhook matches on
    url text not null,
    amount numeric(10,2) not null,
    status text not null default 'pending',  -- pending, paid, cancelled
    created_at timestamptz default now(),
    paid_at timestamptz
);

create index idx_nomod_payment_links_invoice_id on nomod_payment_links(invoice_id);
-- Only one row per Nomod link id, but plenty of rows share a null
-- nomod_link_id being impossible in practice (only set right after the
-- Nomod API call returns) — a partial index keeps that non-issue moot.
create unique index idx_nomod_payment_links_nomod_link_id on nomod_payment_links(nomod_link_id) where nomod_link_id is not null;

alter publication supabase_realtime add table nomod_payment_links;

alter table nomod_payment_links disable row level security;

-- invoice_payments.received_by (migration 042) was "not null" on the
-- assumption every payment is taken by a staff member in person — an
-- online Nomod payment, recorded by the webhook above, has no staff
-- member to attribute it to.
alter table invoice_payments alter column received_by drop not null;
