-- 205_social_duties.sql
-- One person makes one Social post every day (lib/socialDuty.js). Each
-- morning the app picks someone working that day (vets, techs, reception,
-- admin; never drivers or cleaners), whoever has gone longest without a
-- turn, gives them an idea with a shot list, and pushes it to their phone.
-- It nudges them again during the day until they've made a post, and tells
-- the admin in the evening if they still haven't.

create table if not exists social_duties (
  duty_date date primary key,
  staff_id uuid not null references staff(id) on delete cascade,
  idea jsonb,
  post_id uuid references social_posts(id) on delete set null,
  done_at timestamptz,
  reminders integer not null default 0,
  last_reminded_at timestamptz,
  escalated_at timestamptz,
  passed_from uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists social_duties_staff_idx on social_duties (staff_id, duty_date desc);
create index if not exists social_duties_post_idx on social_duties (post_id);
create index if not exists social_duties_passed_from_idx on social_duties (passed_from);

-- Server-only, like social_posts.
alter table social_duties enable row level security;
