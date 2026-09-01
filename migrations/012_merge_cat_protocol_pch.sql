-- Clinics commonly give Cat Flu and Feline Enteritis as a single combined
-- vaccine, known here as "PCH" (Panleukopenia, Calicivirus, Herpesvirus —
-- the same three components), so tracking them as two separate catalog
-- entries didn't match real usage — combine them into one.

-- Rename whichever of "Cat Flu" (not yet merged) or an already-merged
-- "Cat Flu + Feline Enteritis" row exists to the clinic's own name for it.
update vaccine_protocols
set name = 'PCH (Feline Flu + Enteritis)'
where species = 'cat' and name in ('Cat Flu', 'Cat Flu + Feline Enteritis');

-- Re-point any vaccination already logged under the old separate "Feline
-- Enteritis" protocol to the merged one, so no history is lost.
update vaccinations
set vaccine_protocol_id = (
      select id from vaccine_protocols where name = 'PCH (Feline Flu + Enteritis)' and species = 'cat'
    ),
    vaccine_name = 'PCH (Feline Flu + Enteritis)'
where vaccine_protocol_id = (
      select id from vaccine_protocols where name = 'Feline Enteritis' and species = 'cat'
    );

-- Now safe to remove the redundant catalog entry, if it's still there.
delete from vaccine_protocols where name = 'Feline Enteritis' and species = 'cat';
