-- 207_social_reels.sql
-- A Social post can go out as a Reel made from its photos (lib/socialReel.js)
-- instead of as photos: slow zooms and crossfades, the cover headline on the
-- first photo, a short line of text on each of the others, a backing track
-- the clinic made itself (public/social-music) and a Europets end card.
--
-- post_as: 'photos' (as before) or 'reel'.
-- reel_lines: the text on each photo, by media index (null for none); the
--   AI writes them (ai_reel_lines keeps its version) and staff can edit.
-- reel_music: which backing track ('sunny', 'gentle', 'bouncy') or 'none'.
-- reel: the rendered video { path, key, duration, made_at }; key is what it
--   was made from, so the page knows when it needs making again.

alter table social_posts add column if not exists post_as text not null default 'photos';
alter table social_posts add column if not exists reel_lines jsonb;
alter table social_posts add column if not exists ai_reel_lines jsonb;
alter table social_posts add column if not exists reel_music text not null default 'sunny';
alter table social_posts add column if not exists reel jsonb;

alter table social_posts drop constraint if exists social_posts_post_as_check;
alter table social_posts add constraint social_posts_post_as_check check (post_as in ('photos', 'reel'));

alter table social_posts drop constraint if exists social_posts_reel_music_check;
alter table social_posts add constraint social_posts_reel_music_check check (reel_music in ('sunny', 'gentle', 'bouncy', 'none'));
