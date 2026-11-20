-- 258: the neonatal ICU box for kittens (Jim, 20 Nov): a small box with no
-- fixed place on the floor, added as its own "cage" so a kitten can be put
-- in it like any other cage. Shown in the free spot under the left LT pair
-- (app/_components/CageFloorPlan.jsx). Safe to re-run: adds it only once.
insert into public.cages (name, group_name, is_oxygen_room, sort_order)
select 'ICU Box', 'icu_box', false, 1
where not exists (select 1 from public.cages where group_name = 'icu_box');
