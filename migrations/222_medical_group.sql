-- 222_medical_group.sql
-- The team chat's Vets group (migration 219) becomes Medical: the vets
-- and the techs. Its key stays 'vets' (so links and history keep working);
-- on WhatsApp both #medical and #vets go to it. Safe to run more than once.

update team_groups set name = 'Medical', roles = array['vet', 'tech'] where key = 'vets';
