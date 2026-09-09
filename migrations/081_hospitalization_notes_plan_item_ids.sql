-- Lets one worksheet entry record several Day Treatment Plan tasks tapped
-- in quick succession (see DayTreatmentPlan.jsx's logTask consolidation),
-- instead of a separate hospitalization_notes row per tap. plan_item_id
-- stays as-is for any existing reader — this just adds the multi-item form
-- alongside it and backfills it from whatever's already there.

alter table hospitalization_notes
    add column if not exists plan_item_ids uuid[] not null default '{}';

update hospitalization_notes
set plan_item_ids = array[plan_item_id]
where plan_item_id is not null and plan_item_ids = '{}';
