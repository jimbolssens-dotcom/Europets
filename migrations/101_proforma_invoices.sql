-- Migration 101: proforma invoices (quotes) — a patient-scoped quote a vet
-- can hand or send to an owner before committing to treatment, entirely
-- separate from the real invoices/invoice_line_items tables: nothing here
-- is ever picked up by accounting, VAT reporting, or a client's Statement
-- of Accounts (see lib/statementOfAccountsPdf.js, which reads only
-- invoices/invoice_payments). Deliberately its own pair of tables rather
-- than an invoices row with a "draft"/"quote" status — that would risk a
-- quote leaking into real invoice totals/lists through a missed status
-- filter somewhere down the line.
--
-- goods_service_id/description/unit_price/line_total/administration_method
-- mirror invoice_line_items so the same catalog-picker + admin-fee-folding
-- logic (lib/invoicing.js#applyAdministrationFee) can build an item here,
-- but with no source_treatment_item_ids/consolidation_key/instructions/
-- voice_note_path — a quote has no worksheet to sync from and nothing
-- gets dispensed off it.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

create table if not exists proforma_invoices (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references patients(id) on delete cascade not null,
    client_id uuid references clients(id) not null,
    created_by uuid references staff(id),
    created_at timestamptz default now()
);

create table if not exists proforma_invoice_items (
    id uuid primary key default gen_random_uuid(),
    proforma_invoice_id uuid references proforma_invoices(id) on delete cascade not null,
    goods_service_id uuid references goods_services(id),
    description text not null,
    quantity numeric(10,2) not null default 1,
    unit_price numeric(10,2) not null,
    line_total numeric(10,2) not null,
    administration_method text check (administration_method in ('dispense', 'sc', 'im')),
    created_at timestamptz default now()
);

create index if not exists proforma_invoices_patient_id_idx on proforma_invoices (patient_id);
create index if not exists proforma_invoice_items_proforma_invoice_id_idx on proforma_invoice_items (proforma_invoice_id);

alter table proforma_invoices disable row level security;
alter table proforma_invoice_items disable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proforma_invoices'
  ) then
    execute 'alter publication supabase_realtime add table proforma_invoices';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proforma_invoice_items'
  ) then
    execute 'alter publication supabase_realtime add table proforma_invoice_items';
  end if;
end $$;
