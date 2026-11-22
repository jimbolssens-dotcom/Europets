-- 261: a patient that passes away in hospital (Jim, 22 Nov: a cat died on
-- Wednesday and nobody told the owners). Marking it sets passed_away_at;
-- until owner_informed_at is set, every staff screen shows the "tell the
-- owner" alarm, the biggest one there is. Nothing of it reaches the owner's
-- portal or app: the stay stays as it was for them, and the pet is only
-- marked deceased once a staff member records that the owner was told.
-- Adds columns only. Safe to re-run.
alter table public.hospitalizations add column if not exists passed_away_at timestamptz;
alter table public.hospitalizations add column if not exists passed_away_by uuid references public.staff(id);
alter table public.hospitalizations add column if not exists owner_informed_at timestamptz;
alter table public.hospitalizations add column if not exists owner_informed_by uuid references public.staff(id);
alter table public.hospitalizations add column if not exists owner_informed_how text;
