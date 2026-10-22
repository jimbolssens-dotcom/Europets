-- 216_pay_link_short_name.sql
-- A short name for a client's payment link (migration 213), so a rescuer's
-- page shares as epc.vet/pay/sara instead of the random token. The
-- token link keeps working. Lower case letters, numbers and hyphens, one
-- per link, unique. Safe to run more than once.

alter table client_payment_links add column if not exists slug text;
create unique index if not exists client_payment_links_slug_unique on client_payment_links(slug) where slug is not null;
