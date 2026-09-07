-- Migration 071: normalize phone numbers to always start with +971
--
-- Existing numbers were typed/imported in a mix of formats — a bare local
-- number ('0501234567'), a country code with no plus ('971501234567'),
-- an international dialing prefix ('00971501234567'), or already-correct
-- ('+971501234567'). This rewrites every one that isn't already correct.
--
-- Safety: only touches a row whose digits-only local part (after stripping
-- whatever prefix it has) is a plausible UAE subscriber number length
-- (7-10 digits) — a number that doesn't fit that (most likely a genuine
-- non-UAE number, or garbage data) is left untouched rather than guessed
-- at. Run the SELECT at the bottom afterward to see what, if anything,
-- still needs a manual look.
--
-- Run this in your Supabase SQL editor. Safe to run more than once —
-- already-correct rows (+971...) are excluded by the where clause.

with normalized as (
  select
    id,
    regexp_replace(phone, '\D', '', 'g') as digits
  from clients
  where phone is not null and trim(phone) <> '' and phone not like '+971%'
),
local_part as (
  select
    id,
    case
      when digits like '00971%' then substring(digits from 6)
      when digits like '971%' then substring(digits from 4)
      when digits like '0%' then substring(digits from 2)
      else digits
    end as local_digits
  from normalized
)
update clients c
set phone = '+971' || l.local_digits
from local_part l
where c.id = l.id
  and length(l.local_digits) between 7 and 10;

with normalized as (
  select
    id,
    regexp_replace(phone, '\D', '', 'g') as digits
  from client_phones
  where trim(phone) <> '' and phone not like '+971%'
),
local_part as (
  select
    id,
    case
      when digits like '00971%' then substring(digits from 6)
      when digits like '971%' then substring(digits from 4)
      when digits like '0%' then substring(digits from 2)
      else digits
    end as local_digits
  from normalized
)
update client_phones cp
set phone = '+971' || l.local_digits
from local_part l
where cp.id = l.id
  and length(l.local_digits) between 7 and 10;

-- clients.phone is meant to always mirror the client_phones row flagged
-- is_whatsapp — re-sync it now that both have just been normalized, in
-- case the two had drifted (e.g. an older row edited before migration 055).
update clients c
set phone = cp.phone
from client_phones cp
where cp.client_id = c.id
  and cp.is_whatsapp
  and c.phone is distinct from cp.phone;

-- Anything left over here didn't fit the safe 7-10-digit pattern above and
-- needs a manual look — likely a genuine non-UAE number, or bad data typed
-- in originally (too short/too long).
select 'clients' as source, id, phone from clients
where phone is not null and trim(phone) <> '' and phone not like '+971%'
union all
select 'client_phones' as source, id, phone from client_phones
where trim(phone) <> '' and phone not like '+971%';
