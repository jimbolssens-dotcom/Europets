-- Migration 117: manual override for a hospitalization's daily rate
--
-- The daily hospitalization charge (see lib/hospitalizationCharges.js) is
-- normally auto-detected from the patient's species/weight (Cat, Dog S/M,
-- Dog L) and then locked in for the rest of the stay. Staff sometimes need
-- to override that — a rescue case, a long-term-stay discounted rate, etc.
-- — from a dropdown on the Pre-Invoice Overview panel. Setting this only
-- affects days not yet charged; anything already invoiced keeps whatever
-- rate it was actually charged at.

alter table hospitalizations add column if not exists hospitalization_rate_override_id uuid references goods_services(id);
