-- Migration 055: client_phones
--
-- Replaces the fixed phone/phone2(+phone2_label) pair with an open-ended
-- list — a client can have as many numbers on file as needed, each with
-- its own mandatory label (a preset like "Husband"/"Maid", or free text),
-- and exactly one flagged as their preferred WhatsApp number (enforced by
-- the partial unique index below, same technique as the one-cage-per-
-- admitted-case rule in migrations/hospitalizations).
--
-- clients.phone is kept as a synced convenience column — always the
-- current WhatsApp-preferred number — since a lot of existing code
-- (search, WhatsApp draft links, invoice/consent PDFs, the invite
-- auto-detect-by-phone feature) reads it directly. The app keeps it in
-- sync on every add/edit/remove here; nothing needs to change on those
-- read-only call sites.
--
-- Existing phone/phone2 data is backfilled into client_phones below. The
-- phone2 backfill only runs if that column still exists, so this is safe
-- to run even after 056_drop_client_phone2.sql already dropped it.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists client_phones (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade not null,
    phone text not null,
    label text not null,     -- a preset ("Mobile", "Husband", "Maid", ...) or free-typed custom text
    is_whatsapp boolean not null default false,
    created_at timestamptz default now()
);

-- Only one number per client can be the WhatsApp-preferred one.
create unique index if not exists client_phones_one_whatsapp_per_client
    on client_phones (client_id) where (is_whatsapp);

create index if not exists client_phones_client_id_idx on client_phones (client_id);
create index if not exists client_phones_phone_idx on client_phones (phone);

-- Backfill: clients.phone becomes a "Mobile" row flagged as the WhatsApp
-- number. Guarded so re-running this migration doesn't duplicate it.
insert into client_phones (client_id, phone, label, is_whatsapp)
select id, phone, 'Mobile', true
from clients
where phone is not null and phone <> ''
  and not exists (select 1 from client_phones cp where cp.client_id = clients.id and cp.phone = clients.phone);

-- Backfill: clients.phone2 becomes its own row, carrying over whatever
-- label it already had (mapped to the new preset names) — skipped
-- entirely if phone2 has already been dropped (migration 056 ran first).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'phone2'
  ) then
    insert into client_phones (client_id, phone, label, is_whatsapp)
    select id, phone2,
           case phone2_label
             when 'husband' then 'Husband'
             when 'wife' then 'Wife'
             when 'maid' then 'Maid'
             when 'driver' then 'Driver'
             else coalesce(nullif(phone2_label, ''), 'Other')
           end,
           false
    from clients
    where phone2 is not null and phone2 <> ''
      and not exists (select 1 from client_phones cp where cp.client_id = clients.id and cp.phone = clients.phone2);
  end if;
end $$;
