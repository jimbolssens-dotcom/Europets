-- Migration 228: a dose stops counting as due once a newer one is given.
--
-- superseded_by: the later dose of the same vaccine for the same pet that
-- replaced this one. Due lists, the client app and the reminder sweep only
-- count doses with none (app/api/vaccinations/route.js, lib/vaccinationReminders.js).
-- An old dose used to keep its due date for ever after the next one was
-- given, so it read as overdue (11 pets on 26 Oct, the client app included),
-- and every primary course's booster date did the same once the booster
-- was in. Set on every new dose from now on (POST/PATCH /api/vaccinations);
-- backfilled here for doses already on file. Nothing existing is changed:
-- next_due_date stays as it was. Safe to run more than once.

alter table vaccinations add column if not exists superseded_by uuid references vaccinations(id) on delete set null;
create index if not exists idx_vaccinations_due_open on vaccinations(next_due_date) where superseded_by is null;

-- Each older dose (or a held-back reminder with no date given yet) points
-- to the earliest dose of the same vaccine given after it.
update vaccinations v
set superseded_by = (
  select w.id from vaccinations w
  where w.patient_id = v.patient_id
    and w.vaccine_protocol_id = v.vaccine_protocol_id
    and w.id <> v.id
    and w.date_given is not null
    and (v.date_given is null and w.date_given >= coalesce(v.next_due_date, w.date_given) - 31
         or w.date_given > v.date_given)
  order by w.date_given, w.created_at
  limit 1
)
where v.superseded_by is null
  and exists (
    select 1 from vaccinations w
    where w.patient_id = v.patient_id
      and w.vaccine_protocol_id = v.vaccine_protocol_id
      and w.id <> v.id
      and w.date_given is not null
      and (v.date_given is null and w.date_given >= coalesce(v.next_due_date, w.date_given) - 31
           or w.date_given > v.date_given)
  );
