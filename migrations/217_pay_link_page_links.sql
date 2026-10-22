-- 217_pay_link_page_links.sql
-- Two things for a rescuer's pay page (migration 214):
-- * page_style: which page it is. 'photo' is the clinic's page with a
--   cover and Story picture drawn from a photo staff pick (what 214
--   built); 'instagram' is the rescuer's own page, built from their
--   Instagram profile, bio and latest posts, with their links as buttons.
-- * page_links: their own links (website, adoption form, wishlist...),
--   [{ "label": "Adopt a cat", "url": "https://..." }], at most five. On
--   the Instagram page the link in their bio is added by itself.
-- Safe to run more than once.

alter table client_payment_links add column if not exists page_links jsonb;
alter table client_payment_links add column if not exists page_style text not null default 'photo';
alter table client_payment_links drop constraint if exists client_payment_links_page_style_check;
alter table client_payment_links add constraint client_payment_links_page_style_check check (page_style in ('photo', 'instagram'));
