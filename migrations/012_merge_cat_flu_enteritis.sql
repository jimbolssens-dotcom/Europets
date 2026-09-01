-- Clinics commonly give Cat Flu and Feline Enteritis as a single combined
-- vaccine (e.g. "Feline 3-in-1"), so tracking them as two separate catalog
-- entries didn't match real usage — combine them into one.

-- Rename the existing "Cat Flu" protocol to cover both.
update vaccine_protocols
set name = 'Cat Flu + Feline Enteritis'
where name = 'Cat Flu' and species = 'cat';

-- Re-point any vaccination already logged under the old separate "Feline
-- Enteritis" protocol to the newly-combined one, so no history is lost.
update vaccinations
set vaccine_protocol_id = (
      select id from vaccine_protocols where name = 'Cat Flu + Feline Enteritis' and species = 'cat'
    ),
    vaccine_name = 'Cat Flu + Feline Enteritis'
where vaccine_protocol_id = (
      select id from vaccine_protocols where name = 'Feline Enteritis' and species = 'cat'
    );

-- Now safe to remove the redundant catalog entry.
delete from vaccine_protocols where name = 'Feline Enteritis' and species = 'cat';
