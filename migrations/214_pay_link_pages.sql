-- 214_pay_link_pages.sql
-- A personalised page for a client's payment link (migration 213), for a
-- rescuer: a cover picture and a Story picture in the clinic's social style
-- (lib/socialCover.js, lib/socialStory.js, drawn when staff save it), a
-- title and short story, the rescuer's latest Instagram posts (fetched
-- through the clinic's Instagram connection, lib/metaSocial.js), recent
-- supporters who chose to be shown, and the bills already paid. Off
-- (page_enabled false), the link keeps its plain page. Safe to run more
-- than once.

alter table client_payment_links add column if not exists page_enabled boolean not null default false;
alter table client_payment_links add column if not exists page_title text;
alter table client_payment_links add column if not exists page_story text;
-- The photo staff picked (consult-files storage), and the pictures drawn from it.
alter table client_payment_links add column if not exists page_photo_path text;
alter table client_payment_links add column if not exists page_cover_path text;
alter table client_payment_links add column if not exists page_story_image_path text;
alter table client_payment_links add column if not exists instagram_handle text;
-- The rescuer's Instagram profile and latest posts, refreshed twice a day.
alter table client_payment_links add column if not exists page_instagram jsonb;
alter table client_payment_links add column if not exists page_instagram_fetched_at timestamptz;
alter table client_payment_links add column if not exists show_supporters boolean not null default true;
alter table client_payment_links add column if not exists show_bills boolean not null default true;
alter table client_payment_links add column if not exists page_updated_at timestamptz;

-- The payer ticked "show my gift on the page".
alter table nomod_payment_links add column if not exists show_name boolean not null default false;
