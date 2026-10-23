-- 220_team_whatsapp_bridge.sql
-- The team chat (migration 219) on staff's own WhatsApp
-- (lib/teamWhatsapp.js): every group message goes to each member's
-- WhatsApp from the clinic number, labelled with the group and who wrote
-- it, and their reply in WhatsApp goes back into that group for everyone.
-- Safe to run more than once.

-- Each person's WhatsApp number (digits, with country code), and when they
-- last wrote to the clinic number: inside 24 hours a plain message can be
-- sent, otherwise only the approved team_message template.
alter table staff add column if not exists whatsapp_phone text;
alter table staff add column if not exists whatsapp_last_in_at timestamptz;
create unique index if not exists staff_whatsapp_phone_unique on staff (whatsapp_phone) where whatsapp_phone is not null;

-- Where a message came from ('app' or 'whatsapp'), and the WhatsApp id of
-- one that came in from WhatsApp (so a retried delivery isn't posted twice).
alter table team_messages add column if not exists source text not null default 'app';
alter table team_messages add column if not exists wa_message_id text;
create unique index if not exists team_messages_wa_unique on team_messages (wa_message_id) where wa_message_id is not null;

-- Each WhatsApp copy sent to a member: to know which group a reply that
-- quotes it belongs to, and whether it arrived.
create table if not exists team_deliveries (
  id uuid primary key default gen_random_uuid(),
  team_message_id uuid not null references team_messages(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  wa_message_id text unique,
  via text not null check (via in ('text', 'media', 'template')),
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists team_deliveries_staff_idx on team_deliveries (staff_id, created_at desc);
create index if not exists team_deliveries_message_idx on team_deliveries (team_message_id);
alter table team_deliveries enable row level security;

-- Staff read their WhatsApp, so every group message reaches them by
-- default; each person can turn it down to @mentions only, or off.
alter table team_notify alter column level set default 'all';
