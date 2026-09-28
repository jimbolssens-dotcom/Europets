-- Free-text note alongside a logged old-system payment's amount, origin,
-- and date — e.g. which old invoice(s) it was covering, or any other
-- context worth keeping. See app/(admin)/clients/[id]'s "Record payment"
-- form and app/(admin)/accounting/legacy-payments.
alter table legacy_payments
  add column if not exists note text;
