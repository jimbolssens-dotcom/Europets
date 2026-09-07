-- Lets a Nomod payment link target a client's whole outstanding balance
-- (a "campaign" link staff send an owner) instead of always tying to one
-- invoice — see website/app/api/settle-bill/owner/[clientId] and
-- lib/nomodPayments#recordNomodOwnerPayment, which allocates the payment
-- across that client's outstanding invoices oldest-first.
alter table nomod_payment_links alter column invoice_id drop not null;
alter table nomod_payment_links add column if not exists client_id uuid references clients(id);
alter table nomod_payment_links add constraint nomod_payment_links_target_check
  check ((invoice_id is not null) <> (client_id is not null));
create index if not exists idx_nomod_payment_links_client_id on nomod_payment_links(client_id);
