-- Migration 241: a payment-link payment can't be recorded twice
--
-- Jim (2 Nov): INV-000591 and INV-000984 each showed their Nomod payment
-- twice (Nomod received it once), and the thank-you messages told the
-- clients they had paid double. Same on INV-000344 and INV-000656 (15 Oct).
-- Cause: two checks of the Settle Your Bill page at once both found the
-- link still pending, both saw it paid at Nomod, and both logged it
-- (website/lib/nomodPayments.js), 0.2 to 0.8 seconds apart.
--
-- This guard sits in the database, so it holds whatever calls it: before
-- a payment-link payment is saved, it waits for any other payment being
-- saved on the same invoice (an advisory lock, released at the end of the
-- transaction), then drops it if the same amount was already logged on
-- that invoice by payment link in the last 2 minutes. Cash, card and bank
-- payments are untouched. Safe to run more than once.

create or replace function skip_duplicate_payment_link() returns trigger
language plpgsql as $$
begin
  if new.payment_method is distinct from 'payment_link' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('invoice_payment:' || new.invoice_id::text));
  if exists (
    select 1 from invoice_payments p
    where p.invoice_id = new.invoice_id
      and p.payment_method = 'payment_link'
      and p.amount = new.amount
      and p.created_at > now() - interval '2 minutes'
  ) then
    raise notice 'Skipped a duplicate payment-link payment of % on invoice %', new.amount, new.invoice_id;
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_payments_no_double_link on invoice_payments;
create trigger invoice_payments_no_double_link
  before insert on invoice_payments
  for each row execute function skip_duplicate_payment_link();
