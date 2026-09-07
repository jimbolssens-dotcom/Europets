-- Claim marker so only one concurrent resolveRecording run does the
-- non-idempotent work (inserting treatment items, appending extracted
-- text) for a given recording — see lib/recordingProcessing.js.
alter table recordings add column if not exists claimed_at timestamptz;
