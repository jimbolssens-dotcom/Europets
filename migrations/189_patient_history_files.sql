-- 189: a patient's outside history and results: notes from another
-- clinic, old blood tests, x-ray reports, photos, Word/PDF files. Uploaded
-- on the patient page or filed straight from a WhatsApp message, and shown
-- to the owner in the client app when share_with_owner is on.
-- The file itself lives in the consult-files bucket under
-- patient-history/<patient_id>/.
create table if not exists public.patient_history_files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  content_type text,
  title text,
  category text not null default 'other'
    check (category in ('outside_history', 'lab_results', 'imaging', 'other')),
  document_date date,
  share_with_owner boolean not null default true,
  source text not null default 'upload' check (source in ('upload', 'whatsapp')),
  client_message_id uuid references public.client_messages(id) on delete set null,
  uploaded_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists patient_history_files_patient_idx
  on public.patient_history_files (patient_id, document_date desc nulls last, created_at desc);

-- Read and written only through the app's server (service role); the
-- browser key gets nothing.
alter table public.patient_history_files enable row level security;
