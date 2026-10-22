-- 218_rescue_daily_updates.sql
-- Daily hospital updates for a rescue partner (lib/rescueUpdates.js): once
-- a day, staff take one photo of each of the rescuer's animals in hospital
-- (app/(admin)/social/rescue), and the AI writes one carousel post from
-- them (lib/socialDraft.js). It goes through the normal approval on the
-- Social page and is posted with the rescuer invited as an Instagram
-- collaborator, so once they accept it shows on their profile too.
-- Only for partners Jim approved. Safe to run more than once.

create table if not exists social_partners (
  client_id uuid primary key references clients(id) on delete cascade,
  instagram_handle text not null,
  -- Invite them as a collaborator on the post (it then shows on their
  -- profile too, once they accept it in Instagram).
  invite_collab boolean not null default true,
  active boolean not null default true,
  approved_by text,
  -- The day the morning reminder and the afternoon nudge went out.
  pushed_on date,
  nudged_on date,
  created_at timestamptz not null default now()
);
-- Server-only, like social_posts.
alter table social_partners enable row level security;

-- A post's Instagram collaborators (usernames, without the @), and the
-- partner and day of a daily rescue update (one per partner per day).
alter table social_posts add column if not exists collaborators text[] not null default '{}';
alter table social_posts add column if not exists partner_client_id uuid references clients(id) on delete set null;
alter table social_posts add column if not exists partner_date date;
create unique index if not exists social_posts_partner_day on social_posts (partner_client_id, partner_date)
  where partner_client_id is not null and status <> 'discarded';

-- The first partner, approved by Jim on 22 Oct 2026.
insert into social_partners (client_id, instagram_handle, approved_by)
values ('346e2ae6-0ccc-4742-84ab-f9a316aba6bf', 'aileen_cats_rescue', 'Jim (22 Oct 2026)')
on conflict (client_id) do nothing;
