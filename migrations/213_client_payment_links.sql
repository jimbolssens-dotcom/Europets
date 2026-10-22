-- 213_client_payment_links.sql
-- A personal payment link for a client (lib/clientPayLinks.js): anyone with
-- it (the client, or friends and supporters chipping in) pays any amount
-- by card on the website (website/app/pay/[token]). Each payment is logged
-- as an Online Payment (donations) already linked to the client, applied
-- automatically to their unpaid invoices oldest first, and whatever is left
-- stays as credit for their next invoice (lib/clientCredit.js). It replaces
-- the open Nomod Collect link, where every payment had to be matched to a
-- client by hand. Safe to run more than once.

create table if not exists client_payment_links (
  id uuid primary key default gen_random_uuid(),
  -- What goes in the URL: random, so links can't be guessed.
  token text not null unique,
  client_id uuid not null references clients(id) on delete cascade,
  -- Optional: the pet it's for, shown on the page ("towards Bella's care").
  patient_id uuid references patients(id) on delete set null,
  active boolean not null default true,
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Server-only, like the other payment tables: read and written with the
-- service role (the admin app's API and the website's server).
alter table client_payment_links enable row level security;
-- One live link per client; making a new one turns the old one off.
create unique index if not exists client_payment_links_one_active on client_payment_links(client_id) where active;

-- The Nomod link made for each payment through a personal link, and who
-- said they were paying.
alter table nomod_payment_links add column if not exists pay_link_id uuid references client_payment_links(id) on delete set null;
alter table nomod_payment_links add column if not exists payer_name text;
create index if not exists idx_nomod_payment_links_pay_link on nomod_payment_links(pay_link_id) where pay_link_id is not null;

-- An Online Payment that came in for a known client (through their
-- personal link), and the Nomod link it came from (unique, so a payment is
-- never logged twice).
alter table donations add column if not exists client_id uuid references clients(id) on delete set null;
alter table donations add column if not exists nomod_payment_link_id uuid references nomod_payment_links(id) on delete set null;
create unique index if not exists donations_nomod_payment_link_unique on donations(nomod_payment_link_id) where nomod_payment_link_id is not null;
create index if not exists idx_donations_client_id on donations(client_id) where client_id is not null;
