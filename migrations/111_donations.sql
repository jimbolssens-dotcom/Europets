-- Migration 111: donations
--
-- A donation is money received for ongoing cases in general — never
-- through the front desk, always via Nomod, PayMob, PayPal, or a bank
-- transfer — that can fund part of one invoice, several invoices, or (for
-- a big donation) be spread across invoices over time as they come in.
-- Conversely one invoice can be topped up by several different donations.
-- That many-to-many shape is handled by tagging individual
-- invoice_payments rows with which donation they came from, rather than
-- inventing a parallel payment ledger — invoices.amount_paid/status stay
-- exactly as correct as they already are (see recomputeInvoicePayments in
-- lib/invoicing.js), and a donation's own remaining balance is just
-- amount minus the sum of invoice_payments tagged with its id.
--
-- Case traceability comes for free from this shape too: since a donation's
-- money only ever moves through actual invoice_payments rows, and every
-- invoice already belongs to a specific patient/case, "which cases did
-- this donation help" is just "which invoices is its money sitting in" —
-- no separate case-link column needed.
--
-- donation_number resets every month (26-09-06, then 26-10-01, not
-- 26-10-07) — generated in app/api/donations/route.js, not here.
--
-- Only reachable from the Accounting section (see middleware.js) — never
-- shown to PIN-only staff.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists donations (
    id uuid primary key default gen_random_uuid(),
    donation_number text not null unique,
    donor_name text,
    donor_contact text,
    amount numeric(10,2) not null check (amount > 0),
    source text not null check (source in ('nomod', 'paymob', 'paypal', 'bank_transfer')),
    received_at date not null default current_date,
    notes text,
    created_at timestamptz default now()
);

alter table invoice_payments add column if not exists donation_id uuid references donations(id);
create index if not exists idx_invoice_payments_donation on invoice_payments(donation_id);

-- Widens the existing payment_method vocabulary so a donation-sourced
-- payment records its real channel (Nomod/PayMob/PayPal) instead of being
-- squeezed into the generic 'payment_link' bucket already used for this
-- clinic's own Nomod-billed client invoices.
alter table invoice_payments drop constraint if exists invoice_payments_payment_method_check;
alter table invoice_payments add constraint invoice_payments_payment_method_check
  check (payment_method in ('cash', 'card', 'bank_transfer', 'payment_link', 'nomod', 'paymob', 'paypal'));
