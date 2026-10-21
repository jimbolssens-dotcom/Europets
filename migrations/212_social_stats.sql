-- 212_social_stats.sql
-- How each posted Social post did (lib/socialStats.js): likes, comments,
-- and where Meta allows it reach, saves and shares, on Instagram and the
-- Facebook Page, refreshed by the publish sweep. The best ones are shown on
-- the Social page and given to the AI as examples of what works.
-- stats = { instagram: {...}, facebook: {...}, fetched_at }. Safe to run
-- more than once.

alter table social_posts add column if not exists stats jsonb;
