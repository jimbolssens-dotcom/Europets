-- 210_social_stories.sql
-- A Social post can also go out as a Story (lib/socialStory.js): each photo
-- a full-screen 1080x1920 frame with the cover headline on the first and a
-- short line on the others (the same cover_headline / reel_lines as a
-- Reel), each clip as it is, posted one after another to Instagram and the
-- Facebook Page. Safe to run more than once.

alter table social_posts drop constraint if exists social_posts_post_as_check;
alter table social_posts add constraint social_posts_post_as_check check (post_as in ('photos', 'reel', 'story'));
