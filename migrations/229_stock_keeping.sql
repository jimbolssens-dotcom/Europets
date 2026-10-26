-- Migration 229: stock keeping, phase 1 (vaccines, snap tests, PCR tests,
-- fluorescein and urine strips). Only items switched on here are tracked;
-- the rest of the catalog is untouched.
--
-- stock_items      what's on the shelf, counted per unit sold (one test,
--                  one vial). reorder_level: alert at or below this.
-- stock_links      which catalog item uses it up, and how many per unit
--                  charged. Tests count down when charged (a treatment item
--                  on a consult or hospital stay, or a line added straight to
--                  an invoice that didn't come from one).
-- stock_vaccine_links  vaccines count down from the vaccination record, per
--                  dose given, not from the invoice (a Primary course bills
--                  the core vaccine x2 on day one). form 'plain' or 'combo':
--                  the core vaccine and rabies given together as one vial
--                  (PCH-R, DHPPiL-R) is one combo vial; given as two jabs
--                  (vaccinations.given_as = 'separate', when the combo ran
--                  out) it's the plain vial plus Biocan R.
-- stock_movements  every change: received, used, count (the difference
--                  between a count and what was expected). On hand = the sum.
--
-- Alerts (app/api/stock/low-sweep): an item counted or received at least
-- once, at or below its reorder level, gets one message in the Stock team
-- group (admin, reception and techs), repeated weekly until restocked.
-- Safe to run more than once.

create table if not exists stock_items (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    reorder_level numeric(10,2) not null default 0,
    active boolean not null default true,
    sort int not null default 100,
    low_alert_sent_at timestamptz,
    created_at timestamptz default now()
);

create table if not exists stock_links (
    stock_item_id uuid references stock_items(id) on delete cascade not null,
    goods_service_id uuid references goods_services(id) on delete cascade not null,
    per_unit numeric(10,2) not null default 1,
    primary key (stock_item_id, goods_service_id)
);

create table if not exists stock_vaccine_links (
    stock_item_id uuid references stock_items(id) on delete cascade not null,
    vaccine_protocol_id uuid references vaccine_protocols(id) on delete cascade not null,
    form text not null check (form in ('plain', 'combo')),
    primary key (vaccine_protocol_id, form)
);

create table if not exists stock_movements (
    id uuid primary key default gen_random_uuid(),
    stock_item_id uuid references stock_items(id) on delete cascade not null,
    change numeric(10,2) not null,
    kind text not null check (kind in ('received', 'used', 'count', 'adjust')),
    treatment_item_id uuid references treatment_items(id) on delete cascade,
    invoice_line_item_id uuid references invoice_line_items(id) on delete cascade,
    vaccination_id uuid references vaccinations(id) on delete cascade,
    supplier text,
    batch_number text,
    expiry_date date,
    note text,
    staff_id uuid references staff(id) on delete set null,
    created_at timestamptz default now()
);
create index if not exists idx_stock_movements_item on stock_movements(stock_item_id, created_at desc);
create index if not exists idx_stock_movements_treatment on stock_movements(treatment_item_id);
create index if not exists idx_stock_movements_line on stock_movements(invoice_line_item_id);
create index if not exists idx_stock_movements_vaccination on stock_movements(vaccination_id);

alter table vaccinations add column if not exists given_as text check (given_as in ('combo', 'separate'));

alter table stock_items disable row level security;
alter table stock_links disable row level security;
alter table stock_vaccine_links disable row level security;
alter table stock_movements disable row level security;

-- On hand per item, and whether it has been counted or received yet (no
-- alerts before then).
create or replace view stock_levels as
select s.id, s.name, s.reorder_level, s.active, s.sort, s.low_alert_sent_at,
       coalesce(sum(m.change), 0) as on_hand,
       bool_or(m.kind in ('count', 'received')) is true as started,
       max(m.created_at) filter (where m.kind = 'count') as last_counted_at
from stock_items s
left join stock_movements m on m.stock_item_id = s.id
group by s.id;

-- New charges count; an edit re-counts only a row already counted, so
-- editing a charge from before stock keeping started changes nothing.
-- Tests charged on a consult or hospital stay.
create or replace function stock_sync_treatment_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not exists (select 1 from stock_movements where treatment_item_id = new.id) then
    return null;
  end if;
  delete from stock_movements where treatment_item_id = new.id;
  if new.goods_service_id is not null then
    insert into stock_movements (stock_item_id, change, kind, treatment_item_id)
    select l.stock_item_id, -coalesce(new.quantity, 1) * l.per_unit, 'used', new.id
    from stock_links l join stock_items s on s.id = l.stock_item_id and s.active
    where l.goods_service_id = new.goods_service_id;
  end if;
  return null;
end $$;

create or replace trigger trg_stock_treatment_item after insert or update of goods_service_id, quantity on treatment_items
for each row execute function stock_sync_treatment_item();

-- A test added straight onto an invoice (not synced from a treatment item,
-- which already counted it).
create or replace function stock_sync_invoice_line() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not exists (select 1 from stock_movements where invoice_line_item_id = new.id) then
    return null;
  end if;
  delete from stock_movements where invoice_line_item_id = new.id;
  if new.goods_service_id is not null and coalesce(array_length(new.source_treatment_item_ids, 1), 0) = 0 then
    insert into stock_movements (stock_item_id, change, kind, invoice_line_item_id)
    select l.stock_item_id, -coalesce(new.quantity, 1) * l.per_unit, 'used', new.id
    from stock_links l join stock_items s on s.id = l.stock_item_id and s.active
    where l.goods_service_id = new.goods_service_id;
  end if;
  return null;
end $$;

create or replace trigger trg_stock_invoice_line after insert or update of goods_service_id, quantity, source_treatment_item_ids on invoice_line_items
for each row execute function stock_sync_invoice_line();

-- Vaccines, per dose given. A rabies dose given in a combo vial uses
-- nothing of its own (the combo vial counted on the core vaccine's row).
-- A held-back rabies reminder filled in at the booster is a dose given now;
-- correcting the date of an older dose changes nothing.
create or replace function stock_sync_vaccination() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and not exists (select 1 from stock_movements where vaccination_id = new.id)
     and not (old.date_given is null and new.date_given is not null) then
    return null;
  end if;
  delete from stock_movements where vaccination_id = new.id;
  if new.date_given is not null then
    insert into stock_movements (stock_item_id, change, kind, vaccination_id, batch_number)
    select l.stock_item_id, -1, 'used', new.id, new.batch_number
    from stock_vaccine_links l join stock_items s on s.id = l.stock_item_id and s.active
    where l.vaccine_protocol_id = new.vaccine_protocol_id
      and l.form = case when new.given_as = 'combo' then 'combo' else 'plain' end;
  end if;
  return null;
end $$;

create or replace trigger trg_stock_vaccination after insert or update of date_given, given_as, vaccine_protocol_id on vaccinations
for each row execute function stock_sync_vaccination();

-- ---- Phase 1 items ----

-- Vaccines (reorder levels to start with; edit them on the Stock page).
insert into stock_items (name, reorder_level, sort) values
  ('Biofel PCH', 10, 10), ('Biofel PCH-R', 10, 11),
  ('Biocan DHPPiL', 5, 12), ('Biocan DHPPiL-R', 5, 13),
  ('Biocan R', 5, 14)
on conflict (name) do nothing;

insert into stock_vaccine_links (stock_item_id, vaccine_protocol_id, form)
select s.id, p.id, x.form
from (values
  ('Biofel PCH', 'cat', false, 'plain'), ('Biofel PCH-R', 'cat', false, 'combo'),
  ('Biocan DHPPiL', 'dog', false, 'plain'), ('Biocan DHPPiL-R', 'dog', false, 'combo'),
  ('Biocan R', 'cat', true, 'plain'), ('Biocan R', 'dog', true, 'plain')
) as x(stock_name, species, rabies, form)
join stock_items s on s.name = x.stock_name
join vaccine_protocols p on p.species = x.species and p.is_rabies = x.rabies and p.core and p.active
on conflict (vaccine_protocol_id, form) do nothing;

-- Every active snap and PCR test, plus fluorescein and urine strips, each
-- its own stock item under the catalog name, reorder level about two
-- weeks of the last 60 days' use (at least 2).
with tests as (
  select g.id, g.name
  from goods_services g join catalog_subcategories c on c.id = g.subcategory_id
  where g.active and g.main_category = 'test' and c.name in ('Snap', 'PCR')
  union all
  select g.id, g.name from goods_services g where g.active and g.name = 'Fluoresceine Test'
),
used as (
  select l.goods_service_id, sum(l.quantity) q
  from invoice_line_items l join invoices i on i.id = l.invoice_id
  where i.created_at > now() - interval '60 days'
  group by 1
)
insert into stock_items (name, reorder_level, sort)
select t.name, greatest(2, ceil(coalesce(u.q, 0) * 14 / 60.0)), 20
from tests t left join used u on u.goods_service_id = t.id
on conflict (name) do nothing;

insert into stock_links (stock_item_id, goods_service_id)
select s.id, g.id
from goods_services g join catalog_subcategories c on c.id = g.subcategory_id
join stock_items s on s.name = g.name
where g.active and g.main_category = 'test' and (c.name in ('Snap', 'PCR') or g.name = 'Fluoresceine Test')
on conflict do nothing;

-- Urine strips: both urine-strip tests use one strip from the same pot.
insert into stock_items (name, reorder_level, sort) values ('Urine strips', 10, 30) on conflict (name) do nothing;
insert into stock_links (stock_item_id, goods_service_id)
select s.id, g.id from stock_items s, goods_services g
where s.name = 'Urine strips' and g.active and g.name in ('Urine Strip with SG', 'Urine small + sg')
on conflict do nothing;

-- The Stock team group: admin and reception (Finance) and the techs.
insert into team_groups (key, name, roles, sort) values ('stock', 'Stock', array['admin', 'reception', 'tech'], 4)
on conflict (key) do nothing;
