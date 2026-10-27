-- Migration 230: a credit can come from a card payment.
--
-- Client credit is kept as an Online Payment (donations) with a client_id
-- (lib/clientCredit.js). A card payment can leave credit too: on 27 Oct an
-- item charged by mistake was taken off an invoice already paid by card,
-- and what had been paid for it stayed on the client's account as credit
-- (CR-26-10-01). Run by hand in the SQL editor on 27 Oct; here so the code
-- matches the database. Safe to run more than once.

alter table donations drop constraint if exists donations_source_check;
alter table donations add constraint donations_source_check
  check (source = any (array['nomod', 'paymob', 'paypal', 'bank_transfer', 'card']));
