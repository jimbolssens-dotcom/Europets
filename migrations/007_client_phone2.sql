-- 007_client_phone2.sql
-- A second contact number for a client (e.g. the household's driver or
-- maid), tagged with who it belongs to.

alter table clients add column if not exists phone2 text;
alter table clients add column if not exists phone2_label text;  -- 'husband', 'wife', 'maid', 'driver', 'other'
