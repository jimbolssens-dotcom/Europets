-- Migration 199: online payments applied to old-system balances, and
-- fixed monthly costs on expenses
--
-- 1. legacy_payments.donation_id: an online payment (donations, migration
--    111) can now be applied straight to a client's old-system balance
--    from Accounting > Online Payments, not only to a new invoice. The
--    old-system payment it creates points back at the online payment, so
--    the online payment's "allocated" total counts it, and the online
--    payment can't be deleted while it's applied (on delete restrict, the
--    same guard invoice_payments.donation_id gives).
-- 2. PayPal and Paymob as old-system payment origins, so an online payment
--    from either keeps its real method (Nomod and Bank Transfer exist).
-- 3. expenses.fixed_cost: a fixed monthly business cost (salaries, rent,
--    sponsor, utilities...) that the accounting page takes off below gross
--    profit, on the way to net profit. Null means "decide by category"
--    (lib/accountingSummary.js), so no existing row needs touching.
--
-- Safe to run more than once.

alter table legacy_payments
  add column if not exists donation_id uuid references donations(id) on delete restrict;
create index if not exists idx_legacy_payments_donation on legacy_payments(donation_id);

insert into legacy_payment_methods (name)
select v.name
from (values ('PayPal'), ('Paymob')) as v(name)
where not exists (select 1 from legacy_payment_methods m where lower(m.name) = lower(v.name));

alter table expenses add column if not exists fixed_cost boolean;
