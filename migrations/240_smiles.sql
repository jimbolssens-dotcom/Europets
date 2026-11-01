-- Migration 240: the homepage's kindness garden
--
-- Jim: make the homepage something cute that encourages the team to be
-- kind and make someone smile every day. Each "I made someone smile" tap
-- on the homepage plants a flower: one row here, with an optional short
-- note ("Luna's owner laughed at her new haircut") and who planted it.
-- The garden shows this week's flowers (app/api/smiles).
--
-- Server-only (RLS on, no policy), written with the service role. Safe to
-- run more than once.

create table if not exists smiles (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  note text,
  by text
);

create index if not exists smiles_created_at on smiles (created_at);

alter table smiles enable row level security;
