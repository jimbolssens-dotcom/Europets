-- 215_supporter_bonus.sql
-- A supporter bonus for a rescuer (lib/supporterBonus.js): for each gift
-- through their personal payment link (migration 213), the clinic takes a
-- discount off the rescuer's bills by tier (e.g. AED 500 -> AED 50 off,
-- AED 1,000 -> AED 150, AED 2,000 -> AED 400; the highest tier a single
-- gift reaches). Applied automatically as an invoice discount
-- (invoice_discounts, migration 123), not as money received. Only for
-- clients Jim approved: there is no button to switch it on.
-- Safe to run more than once.

create table if not exists client_promotions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- [{ "min": 2000, "bonus": 400 }, ...]: gift of at least min -> bonus off the bills (VAT included).
  tiers jsonb not null,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table client_promotions enable row level security;
create unique index if not exists client_promotions_one_active on client_promotions(client_id) where active;

-- One bonus per gift, earned when the gift came in and used up on the
-- rescuer's bills (now, or on their next invoice).
create table if not exists promotion_bonuses (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references client_promotions(id) on delete cascade,
  donation_id uuid not null unique references donations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  gift_amount numeric(10,2) not null,
  -- Off the bills, VAT included.
  amount numeric(10,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
alter table promotion_bonuses enable row level security;
create index if not exists idx_promotion_bonuses_client on promotion_bonuses(client_id);

-- The invoice discount a bonus became (part of one, when an invoice
-- needed less than the whole bonus).
alter table invoice_discounts add column if not exists promotion_bonus_id uuid references promotion_bonuses(id) on delete set null;
create index if not exists idx_invoice_discounts_bonus on invoice_discounts(promotion_bonus_id) where promotion_bonus_id is not null;
