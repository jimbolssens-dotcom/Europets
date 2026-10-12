-- Migration 174: automatic outstanding-invoice reminders, and their log
--
-- An open invoice (unpaid / partially paid, AED 50 or more still due) gets
-- up to three reminders, by WhatsApp and email both (see
-- lib/invoiceReminders.js, run daily by GET /api/invoices/send-due-reminders):
--   stage 1, gentle:   2 weeks after the invoice
--   stage 2, second:   1 month after
--   stage 3, stronger: 2 months after (asks to settle within 7 days)
--
-- invoice_reminders is the log: one row per invoice per stage per channel.
-- A 'sent' row is never repeated (unique index below); a 'failed' row is
-- kept for the record and the send is retried on the next run.
--
-- clients.payment_reminders_off is the tick box on the client page that
-- stops reminders for that client (on account, insurance, disputed...).
--
-- Written and read only through the API with supabaseAdmin: RLS on, no
-- policies.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table clients
    add column if not exists payment_reminders_off boolean not null default false;

create table if not exists invoice_reminders (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid references invoices(id) on delete cascade not null,
    client_id uuid references clients(id) on delete cascade,
    stage smallint not null check (stage in (1, 2, 3)),
    channel text not null check (channel in ('whatsapp', 'email')),
    status text not null check (status in ('sent', 'failed')),
    error text,
    wa_message_id text,
    amount_due numeric,
    sent_at timestamptz not null default now()
);

create index if not exists invoice_reminders_invoice_id_idx
    on invoice_reminders (invoice_id, sent_at);

create unique index if not exists invoice_reminders_sent_once_idx
    on invoice_reminders (invoice_id, stage, channel)
    where status = 'sent';

alter table invoice_reminders enable row level security;
