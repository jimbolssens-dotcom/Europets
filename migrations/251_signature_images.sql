-- Migration 251: signature and stamp images (Jim, 13 Nov)
--
-- A vet's signature and their own stamp, uploaded once on the Staff page
-- and printed on every prescription PDF (lib/prescriptionPdf.js),
-- so a prescription goes out signed and stamped.
--
-- key: 'staff:<staff uuid>' for a vet's signature, 'stamp:<staff uuid>'
-- for their stamp. png: the cleaned image (white paper made transparent, cropped) as
-- base64 PNG, a few tens of KB.
--
-- Kept in its own table, readable only through the app's server routes
-- (service role): the staff table is read with the public key, and a
-- signature must never be reachable from outside.
--
-- Adds a table. Safe to run more than once.

create table if not exists signature_images (
  key text primary key,
  png text not null,
  width int,
  height int,
  updated_at timestamptz not null default now()
);

alter table signature_images enable row level security;
revoke all on signature_images from anon, authenticated;
