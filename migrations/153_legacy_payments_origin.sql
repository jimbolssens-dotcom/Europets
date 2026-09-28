-- Records how a logged old-system payment actually arrived (cash, bank
-- transfer, card, or other) alongside the amount and date already
-- tracked — see app/(admin)/clients/[id]'s "Record payment" form and
-- app/(admin)/accounting/legacy-payments. Nullable: the 62 rows already
-- imported from the old system's own export predate this field and have
-- no known origin to backfill; every new payment logged from here on is
-- required to set one client-side.
alter table legacy_payments
  add column if not exists payment_method text;
