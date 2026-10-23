-- 219_team_chat.sql
-- The clinic's own team chat inside the app (Messages → 👥 Team,
-- lib/teamChat.js), instead of a WhatsApp group on staff phones: groups,
-- their messages (text, photo, voice note, @mentions), who has read what,
-- and each person's alert setting. A client's WhatsApp message can be
-- shared into a group (ref), and a reply from there goes to the client from
-- the clinic WhatsApp number (replied_*). Server-only, like the other
-- staff tables. Safe to run more than once.

create table if not exists team_groups (
  key text primary key,
  name text not null,
  -- Everyone in these roles is in the group; null means every role.
  roles text[],
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
alter table team_groups enable row level security;

-- People added to a group on top of its roles (e.g. Jim in Finance).
create table if not exists team_group_members (
  group_key text not null references team_groups(key) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  primary key (group_key, staff_id)
);
alter table team_group_members enable row level security;

create table if not exists team_messages (
  id uuid primary key default gen_random_uuid(),
  group_key text not null references team_groups(key) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  body text,
  media_url text,
  media_type text,
  media_name text,
  mentions uuid[] not null default '{}',
  -- A shared client message: { kind: 'client_message', client_id,
  -- client_name, message_id, quote, patient_name }.
  ref jsonb,
  replied_by uuid references staff(id) on delete set null,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists team_messages_group_created_idx on team_messages (group_key, created_at desc);
alter table team_messages enable row level security;

create table if not exists team_reads (
  group_key text not null references team_groups(key) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (group_key, staff_id)
);
alter table team_reads enable row level security;

-- Phone alerts for group messages: 'all', 'mentions' (the default) or
-- 'off'. An @mention always alerts.
create table if not exists team_notify (
  staff_id uuid primary key references staff(id) on delete cascade,
  level text not null default 'mentions' check (level in ('all', 'mentions', 'off'))
);
alter table team_notify enable row level security;

insert into team_groups (key, name, roles, sort) values
  ('everyone', 'Everyone', null, 0),
  ('vets', 'Vets', array['vet'], 1),
  ('reception', 'Reception', array['reception'], 2),
  ('finance', 'Finance', array['admin'], 3)
on conflict (key) do nothing;
