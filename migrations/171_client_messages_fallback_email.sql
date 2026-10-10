-- Migration 171: email a reminder only when its WhatsApp fails.
--
-- Vaccination reminders used to go out on WhatsApp AND as an email copy
-- to every client with an address on file. Now the email is only a
-- fallback. When the WhatsApp send is refused outright, the email goes at
-- once. When Meta accepts it but reports minutes later that it never
-- arrived (a 'failed' status on the webhook), the email has to be sent
-- then, so the WhatsApp row keeps the email it would fall back to:
--   fallback_email          {to, subject, text}, set when the WhatsApp is sent
--   fallback_email_sent_at  when the webhook sent it (also stops a repeat
--                           'failed' status from sending it twice)
-- Safe to run more than once.

alter table client_messages add column if not exists fallback_email jsonb;
alter table client_messages add column if not exists fallback_email_sent_at timestamptz;
