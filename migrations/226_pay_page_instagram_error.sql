-- 226_pay_page_instagram_error.sql
-- Why a rescuer's Instagram couldn't be loaded onto their pay page
-- (migration 214, lib/payLinkPages.js): Meta's own words, shown in the
-- page editor after Save. Safe to run more than once.

alter table client_payment_links add column if not exists page_instagram_error text;
