-- 257: a payment link that doesn't show what the client owes (Jim, 19 Nov).
-- For an owner sharing her link with donors: the pay page then shows no
-- "AED ... still to pay on the account", and the website doesn't send the
-- balance to the browser at all. Off for every existing link. Safe to re-run.
alter table public.client_payment_links
  add column if not exists hide_balance boolean not null default false;
