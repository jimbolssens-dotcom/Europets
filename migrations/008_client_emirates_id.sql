-- 008_client_emirates_id.sql
-- Emirates ID number for a client, filled in either by typing it or by
-- scanning the card (Claude reads the name + ID number off the photo).
-- The scanned card image itself is stored as a regular attachment
-- (entity_type='client'), not a new column — no migration needed for that.

alter table clients add column if not exists emirates_id text;
