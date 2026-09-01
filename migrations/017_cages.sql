-- Migration 017: cage layout — a fixed physical map of the clinic's
-- hospitalization cages, so a case can be assigned to (and found via) the
-- actual cage it's in, separate from the generic consult/surgery `rooms`.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

create table cages (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    group_name text not null,  -- 'standard', 'long_term', 'recovery', 'dog', 'isolation', 'post_op'
    is_oxygen_room boolean not null default false,
    sort_order int not null default 0
);

insert into cages (name, group_name, is_oxygen_room, sort_order) values
    ('Cage 1', 'standard', false, 1),
    ('Cage 2', 'standard', false, 2),
    ('Cage 3', 'standard', false, 3),
    ('Cage 4', 'standard', false, 4),
    ('Cage 5', 'standard', false, 5),
    ('Cage 6', 'standard', false, 6),
    ('Cage 7', 'standard', false, 7),
    ('Cage 8', 'standard', false, 8),
    ('Cage 9', 'standard', false, 9),
    ('Cage 10', 'standard', false, 10),
    ('Cage 11', 'standard', false, 11),
    ('Cage 12', 'standard', false, 12),
    ('LT 1', 'long_term', false, 1),
    ('LT 2', 'long_term', false, 2),
    ('LT 3', 'long_term', false, 3),
    ('LT 4', 'long_term', false, 4),
    ('LT 5', 'long_term', false, 5),
    ('R 1', 'recovery', false, 1),
    ('R 2', 'recovery', false, 2),
    ('R 3', 'recovery', false, 3),
    ('R 4', 'recovery', false, 4),
    ('D 1', 'dog', false, 1),
    ('D 2', 'dog', false, 2),
    ('D 3', 'dog', false, 3),
    ('D 4', 'dog', false, 4),
    ('ISO 1', 'isolation', false, 1),
    ('ISO 2', 'isolation', false, 2),
    ('ISO 3', 'isolation', false, 3),
    ('PT 1', 'post_op', false, 1),
    ('PT 2', 'post_op', false, 2),
    ('PT 3', 'post_op', true, 3),
    ('PT 4', 'post_op', false, 4),
    ('PT 5', 'post_op', false, 5);

alter table hospitalizations add column cage_id uuid references cages(id);

-- Only one admitted case can occupy a cage at a time. Doesn't block a
-- discharged case from keeping its old cage_id for the record — this only
-- applies while status = 'admitted'.
create unique index idx_hospitalizations_cage_active on hospitalizations(cage_id)
    where status = 'admitted' and cage_id is not null;

alter table cages disable row level security;
