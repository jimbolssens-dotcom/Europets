-- 196: a WhatsApp voice note's text, transcribed on arrival (AssemblyAI),
-- shown under the audio player and read by the AI concierge and the
-- unanswered-message sweep like a typed message. Null when it isn't a
-- voice note, or transcription failed (it then goes to staff as before).
-- Safe to re-run.
alter table public.client_messages add column if not exists transcript text;
