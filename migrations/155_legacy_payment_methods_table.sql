-- Makes the old-system payment "Origin" list staff-manageable instead of
-- a fixed set baked into the code — so someone can add "Nomod", "Tap",
-- "PayPal", etc. themselves instead of asking for a code change every
-- time a new payment origin comes up. Seeded with the 4 built-in options
-- already in use; legacy_payments.payment_method (migration 153) now
-- stores the plain name text directly (e.g. "Cash"), not a short code, so
-- there's nothing to translate between a stored key and a display label
-- anywhere this shows up.
create table if not exists legacy_payment_methods (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamptz default now()
);

insert into legacy_payment_methods (name) values
    ('Cash'),
    ('Bank Transfer'),
    ('Card'),
    ('Other')
on conflict (name) do nothing;

alter table legacy_payment_methods disable row level security;
