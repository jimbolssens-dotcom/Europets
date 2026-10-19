-- 203_social_publishing.sql
-- Publishing Social posts (migration 202) to Instagram and Facebook
-- through Meta's API (lib/metaSocial.js). An approved post is posted now or
-- at scheduled_for; the five-minute sweep (app/api/social-posts/
-- publish-sweep) posts the due ones and finishes Instagram videos, which
-- Meta needs a while to process before they can go out.
--
-- publish_state keeps each network's progress so a retry never posts twice:
-- { instagram: { status, container_id, children, id, permalink },
--   facebook: { status, id, permalink } }.
-- publish_lock_until stops the sweep and a "Post now" tap from running the
-- same post at once.

alter table social_posts add column if not exists publish_targets text[] not null default array['instagram', 'facebook'];
alter table social_posts add column if not exists scheduled_for timestamptz;
alter table social_posts add column if not exists publish_state jsonb not null default '{}'::jsonb;
alter table social_posts add column if not exists publish_error text;
alter table social_posts add column if not exists publish_lock_until timestamptz;

create index if not exists social_posts_due_idx on social_posts (scheduled_for) where status = 'approved';
