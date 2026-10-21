-- 211_social_layouts.sql
-- A Social post that goes out as photos can open with a layout picture
-- (lib/socialLayoutPlan.js, lib/socialLayout.js): a Before / After or a
-- Collage of 2 to 4 of its photos, with the cover text on it.
-- layout = { "kind": "before_after" | "collage", "items": [media indexes] },
-- null for none. Safe to run more than once.

alter table social_posts add column if not exists layout jsonb;
