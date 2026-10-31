-- Migration 239: what each Claude call costs, per feature
--
-- Jim asked what was behind the Anthropic API bill. The Console only shows
-- totals, so every call through lib/anthropicClient.js now logs a row here
-- (lib/aiUsage.js): which feature made it ('whatsapp-concierge',
-- 'dictation-summary', 'consult-report', ...), the model, the token counts
-- and an estimated cost in US dollars.
--
-- Server-only (RLS on, no policy), written with the service role. Safe to
-- run more than once.

create table if not exists ai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  feature text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12,6)
);

create index if not exists ai_usage_created_at on ai_usage (created_at);
create index if not exists ai_usage_feature_created_at on ai_usage (feature, created_at);

alter table ai_usage enable row level security;
