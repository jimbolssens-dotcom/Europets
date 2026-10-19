-- 204_social_handles_and_plans.sql
-- Two Social page additions (migrations 202, 203):
--
-- 1. The owner's Instagram handle (optional, asked on the intake form and
--    editable on the client page), so a post about their pet mentions them
--    in the Instagram caption and they're notified (lib/socialDraft.js).
--    Stored without the @, lowercase.
--
-- 2. A weekly content plan: the AI's 3 to 4 post ideas for the week with
--    what to film for each (lib/socialPlan.js), one row per week (the
--    Monday). A post made from an idea remembers it (social_posts.plan_idea,
--    "<week>:<n>"), so the plan shows which ideas are done.

alter table clients add column if not exists instagram_handle text;
alter table intake_requests add column if not exists instagram_handle text;

alter table clients drop constraint if exists clients_instagram_handle_check;
alter table clients add constraint clients_instagram_handle_check
  check (instagram_handle is null or instagram_handle ~ '^[a-z0-9._]{1,30}$');

create table if not exists social_plans (
  week_start date primary key,
  ideas jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-only, like social_posts.
alter table social_plans enable row level security;

alter table social_posts add column if not exists plan_idea text;
