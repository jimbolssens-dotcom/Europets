-- Migration 181: transfer a patient to another owner
--
-- Same patient, same patient number; it moves to the new owner's file
-- with its clinical history (consults, stays and day procedures,
-- appointments, cattery bookings, consent forms, proforma quotes,
-- discharge follow-ups; vaccinations, alerts, weights and photos hang off
-- the patient itself, so they follow automatically). Paid invoices always
-- stay with whoever paid them. Unpaid / partly paid invoices for the pet
-- stay with the old owner, or move to the new one when staff choose that
-- (p_move_unpaid). Owner-level records (messages, old-system balance and
-- payments, reminders already sent) stay with the old owner.
--
-- One function, one transaction: a transfer never stops halfway. Each
-- transfer is logged in patient_owner_transfers.
--
-- Safe to run more than once.

create table if not exists patient_owner_transfers (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  from_client_id uuid references clients(id) on delete set null,
  to_client_id uuid references clients(id) on delete set null,
  moved_unpaid_invoices boolean not null default false,
  moved_invoice_ids uuid[] not null default '{}',
  staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists patient_owner_transfers_patient_idx
  on patient_owner_transfers (patient_id, created_at);

alter table patient_owner_transfers enable row level security;

create or replace function transfer_patient(
  p_patient uuid,
  p_new_client uuid,
  p_move_unpaid boolean,
  p_staff uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_invoices uuid[] := '{}';
  v_counts jsonb;
begin
  select client_id into v_old from patients where id = p_patient for update;
  if not found then raise exception 'patient not found'; end if;
  if v_old = p_new_client then raise exception 'the patient already belongs to this owner'; end if;
  perform 1 from clients where id = p_new_client;
  if not found then raise exception 'new owner not found'; end if;

  if p_move_unpaid then
    select coalesce(array_agg(i.id), '{}') into v_invoices
      from invoices i
     where i.client_id = v_old
       and i.status in ('unpaid', 'partially_paid')
       and (i.visit_id in (select id from visits where patient_id = p_patient)
            or i.hospitalization_id in (select id from hospitalizations where patient_id = p_patient));
    update invoices set client_id = p_new_client where id = any(v_invoices);
  end if;

  update patients set client_id = p_new_client where id = p_patient;
  update visits set client_id = p_new_client where patient_id = p_patient;
  update hospitalizations set client_id = p_new_client where patient_id = p_patient;
  update appointments set client_id = p_new_client where patient_id = p_patient;
  update cattery_bookings set client_id = p_new_client where patient_id = p_patient;
  update consent_forms set client_id = p_new_client where patient_id = p_patient;
  update proforma_invoices set client_id = p_new_client where patient_id = p_patient;
  update discharge_followups set client_id = p_new_client where patient_id = p_patient;

  insert into patient_owner_transfers (patient_id, from_client_id, to_client_id, moved_unpaid_invoices, moved_invoice_ids, staff_id)
  values (p_patient, v_old, p_new_client, p_move_unpaid, v_invoices, p_staff);

  v_counts := jsonb_build_object('from_client_id', v_old, 'to_client_id', p_new_client, 'moved_invoices', coalesce(array_length(v_invoices, 1), 0));
  return v_counts;
end;
$$;

revoke all on function transfer_patient(uuid, uuid, boolean, uuid) from public, anon, authenticated;
