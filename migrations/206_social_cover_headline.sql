-- 206_social_cover_headline.sql
-- A headline on the cover photo of a Social post (lib/socialCover.js): the
-- AI writes one with the captions (ai_cover_headline keeps its version,
-- like ai_caption_instagram), staff can edit it or clear it on the draft,
-- and when it's set the first photo goes out with it laid over the bottom
-- in the clinic's style. Empty means the cover goes out as it was taken.

alter table social_posts add column if not exists cover_headline text;
alter table social_posts add column if not exists ai_cover_headline text;

alter table social_posts drop constraint if exists social_posts_cover_headline_length;
alter table social_posts add constraint social_posts_cover_headline_length
  check (cover_headline is null or char_length(cover_headline) <= 80);
