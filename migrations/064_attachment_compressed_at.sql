-- Tracks whether an attachment's image has already been shrunk down after
-- its case (consult/hospitalization) closed — see lib/attachmentCompression.js.
-- Null means still full-size/untouched.
alter table attachments add column if not exists compressed_at timestamptz;
