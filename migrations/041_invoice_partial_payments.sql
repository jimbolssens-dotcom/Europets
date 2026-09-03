-- migrations/041_invoice_partial_payments.sql
-- Partial payment tracking for invoices: a running amount_paid total on
-- the invoice, and a log of every individual payment received against it
-- (amount, method, who took it, when) so a bill can be paid in
-- installments — possibly by different methods — without losing the
-- trail. Status gains a 'partially_paid' value between unpaid and paid;
-- like the existing unpaid/paid/void values, it's enforced at the
-- application level (see lib/invoicing.js recomputeInvoicePayments and
-- app/api/invoices/[id]/payments/route.js) rather than a DB constraint,
-- matching how this column already worked.

alter table invoices add column amount_paid numeric(10,2) not null default 0;

comment on column invoices.status is 'unpaid, partially_paid, paid, void';

create table invoice_payments (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid references invoices(id) on delete cascade not null,
    amount numeric(10,2) not null check (amount > 0),
    payment_method text not null check (payment_method in ('cash', 'card', 'bank_transfer', 'payment_link')),
    received_by uuid references staff(id),
    paid_at timestamptz not null default now(),
    created_at timestamptz default now()
);

create index invoice_payments_invoice_id_idx on invoice_payments(invoice_id);
