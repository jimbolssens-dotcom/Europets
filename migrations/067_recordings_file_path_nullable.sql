-- recordings.file_path was `not null` from its original migration
-- (006_ai_recordings.sql), predating the later audio-delete-after-
-- transcription feature (lib/recordingProcessing.js), which sets
-- file_path to null once the audio is removed from Storage. Every
-- recording whose audio successfully deleted was hitting this
-- constraint on the final "mark done" write — a real Postgres error
-- that the calling code never checked, so it failed silently while
-- still reporting success, leaving the recording stuck at
-- status='processing' forever with no error ever recorded.
alter table recordings alter column file_path drop not null;
